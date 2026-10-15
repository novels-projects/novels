package service

import (
	"errors"
	"fmt"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Choice business errors — ค่า message คงไว้ตามเดิมเพื่อไม่เปลี่ยนข้อความที่ส่งกลับให้ client
// และใช้ errors.Is เพื่อ map กับ HTTP status ที่เหมาะสม (400/404/409) ใน handler
var (
	// ErrInvalidChoiceLabel ตาม VAL-04: label ไม่เกิน 80 อักขระ
	ErrInvalidChoiceLabel     = errors.New("choice label must not exceed 80 characters")
	ErrChoiceFromSceneMissing = errors.New("ต้นทาง (from_scene_id) ไม่มีอยู่ในระบบ")
	ErrChoiceToSceneMissing   = errors.New("ปลายทาง (to_scene_id) ไม่มีอยู่ในระบบ")
	ErrChoiceCrossNovel       = errors.New("ไม่สามารถเชื่อมโยงฉากข้ามเรื่องนิยายกันได้")
	ErrChoiceSelfLoop         = errors.New("ฉากต้นทางและปลายทางห้ามเป็นฉากเดียวกัน")
	ErrChoiceFromEnding       = errors.New("ฉากต้นทางเป็นฉากจบ ไม่สามารถสร้างทางเลือกต่อไปได้")
	ErrChoiceToStart          = errors.New("ไม่สามารถสร้างทางเลือกย้อนกลับไปที่จุดเริ่มต้นของเรื่องได้")
	ErrChoiceReverse          = errors.New("ไม่สามารถสร้างทางเลือกย้อนกลับไปยังฉากต้นทางได้")
	ErrChoiceDuplicate        = errors.New("ทางเลือกนี้มีอยู่แล้ว")
	ErrChoiceCycle            = errors.New("การเชื่อมต่อนี้จะสร้างวงวนในกราฟเรื่องได้")
	ErrChoiceNotFound         = errors.New("ไม่พบทางเลือกที่ต้องการอัปเดต")
	ErrChoiceWrongOrigin      = errors.New("ทางเลือกนี้ไม่ได้อยู่ในฉากต้นทางที่ระบุ")
	ErrChoiceForeignToScene   = errors.New("ทางเลือกนี้ไม่ได้อยู่ในฉากต้นทางที่กำลังซิงก์")
)

// validateChoiceLabelLength ตาม VAL-04: ตรวจความยาว label ทุกเส้นทางที่สร้าง/แก้ choice
func validateChoiceLabelLength(label string) error {
	if utf8.RuneCountInString(label) > 80 {
		return ErrInvalidChoiceLabel
	}
	return nil
}

// =========================================================================================
// [อาจารย์ถาม: "ดัก Loop ไม่ให้เนื้อเรื่องวนลูปยังไง / เช็ค DAG ด้วยวิธีอะไร?"]
//
// ฟังก์ชัน: wouldCreateCycle
// หลักการ: ใช้ขั้นตอนวิธี Depth-First Search (DFS) ในการตรวจจับวงรอบ (Cycle Detection)
//
// ทำงานอย่างไร:
// 1. จำลองว่าถ้าเราลากเส้นเชื่อมใหม่ (fromSceneID -> toSceneID) ลงไปในกราฟเรื่อง
// 2. ถ้าเส้นนี้ทำให้เกิดลูป แสดงว่า "จะต้องมีทางเดินจาก toSceneID เดินหน้าต่อไปเรื่อยๆ จนวนกลับมาถึง fromSceneID ได้"
// 3. ดังนั้น ระบบจะเริ่ม DFS โดยเอา toSceneID ใส่ Stack แล้วเดินตามลูกศร (Adjacency List) ไปข้างหน้า
// 4. ถ้าเจอโหนดไหนที่ ID ตรงกับ fromSceneID -> แปลว่า "เกิดวงรอบ (Loop)" ทันที! -> คืนค่า true
// 5. ถ้าเดินจนทั่ว (Visited ครบทุกโหนดที่เป็นไปได้) แล้วไม่เจอ fromSceneID -> ปลอดภัย -> คืนค่า false
// =========================================================================================
func (s *sceneService) wouldCreateCycle(fromSceneID, toSceneID int, edges []models.SceneEdge) bool {
	// ป้องกัน Edge ที่ไม่ถูกต้อง หรือลากเข้าตัวเอง (Self-loop)
	if fromSceneID == 0 || toSceneID == 0 || fromSceneID == toSceneID {
		return false
	}

	// สร้าง Adjacency List: ตัวเชื่อมบอกว่าโหนดไหนชี้ไปโหนดไหนบ้าง เช่น { 1: [2, 3], 2: [4] }
	adjacency := make(map[int][]int)
	for _, edge := range edges {
		adjacency[edge.FromID] = append(adjacency[edge.FromID], edge.ToID)
	}

	// เริ่ม DFS จากจุดปลายทาง (toSceneID) เพื่อดูว่าจะเดินวนกลับมาหาต้นทาง (fromSceneID) ได้ไหม
	visited := make(map[int]bool)
	stack := []int{toSceneID}

	for len(stack) > 0 {
		// ดึงโหนดบนสุดของ Stack ออกมาตรวจสอบ (LIFO)
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		// ถ้าเดินมาจนเจอ fromSceneID แสดงว่ามีเส้นทางวนกลับมาที่เดิม = เกิด Loop!
		if current == fromSceneID {
			return true
		}
		if visited[current] {
			continue
		}
		visited[current] = true

		// แตกกิ่งก้าน (โหนดลูกที่ current ชี้ไป) ใส่ Stack เพื่อค้นหาต่อ
		for _, next := range adjacency[current] {
			if !visited[next] {
				stack = append(stack, next)
			}
		}
	}

	// เดินจนครบทุกเส้นทางแล้ว ไม่เจอทางวนกลับมา = ปลอดภัย เป็น DAG แน่นอน
	return false
}

// CreateChoice ทำหน้าที่สร้างตัวเลือกใหม่เชื่อมระหว่าง 2 ฉาก (from_scene -> to_scene)
// มีการครอบด้วย WithNovelGraphMutation (Database Lock / Transaction) เพื่อป้องกันปัญหานักเขียน
// 2 คนกดบันทึกทางเลือกพร้อมกันแล้วเกิด Race Condition
func (s *sceneService) CreateChoice(choice models.Choice) (int, error) {
	choice.Label = strings.TrimSpace(choice.Label)
	if err := validateChoiceLabelLength(choice.Label); err != nil {
		return 0, err
	}
	fromScene, err := s.repo.GetSceneByID(choice.FromSceneID)
	if err != nil {
		return 0, ErrChoiceFromSceneMissing
	}

	choiceID := 0
	err = s.repo.WithNovelGraphMutation(fromScene.NovelID, func(repo repository.ChoiceMutationRepository) error {
		var err error
		choiceID, err = s.createChoiceInMutation(repo, choice)
		return err
	})
	return choiceID, err
}

func (s *sceneService) createChoiceInMutation(repo repository.ChoiceMutationRepository, choice models.Choice) (int, error) {
	if err := validateChoiceLabelLength(choice.Label); err != nil {
		return 0, err
	}
	// 1. ตรวจสอบ Endpoint ของทั้ง 2 ฉาก (ฉากมีอยู่จริงไหม, ข้ามเรื่องไหม, ฉากจบไหม)
	fromScene, _, err := s.validateChoiceEndpoints(repo, choice.FromSceneID, choice.ToSceneID)
	if err != nil {
		return 0, err
	}

	// 2. เช็คการย้อนกลับ (Reverse Choice): ห้ามมีเส้นทางสวนทางกัน A->B แล้วสร้าง B->A ตรงๆ
	reverseExists, err := repo.CheckChoiceExists(choice.ToSceneID, choice.FromSceneID, "")
	if err != nil {
		return 0, fmt.Errorf("check reverse choice: %w", err)
	}
	if reverseExists {
		return 0, ErrChoiceReverse
	}

	// 3. เช็คข้อมูลซ้ำ (Label ซ้ำในเส้นทางเดิม A -> B ที่มีข้อความเดียวกันเป๊ะ)
	exists, err := repo.CheckChoiceExists(choice.FromSceneID, choice.ToSceneID, choice.Label)
	if err != nil {
		return 0, fmt.Errorf("check duplicate choice: %w", err)
	}
	if exists {
		return 0, ErrChoiceDuplicate
	}

	// 4. ดึง Edges ทั้งหมดในนิยายเรื่องนี้มาตรวจสอบว่าสร้าง Loop หรือไม่ด้วย DFS
	edges, err := repo.GetEdgesByNovelID(fromScene.NovelID)
	if err != nil {
		return 0, fmt.Errorf("get edges for cycle validation: %w", err)
	}
	if s.wouldCreateCycle(choice.FromSceneID, choice.ToSceneID, edges) {
		return 0, ErrChoiceCycle
	}

	// ผ่านทุกกฎครบถ้วน จึงอนุญาตให้ Insert ลงใน Database
	return repo.CreateChoice(choice)
}

// =========================================================================================
// [อาจารย์ถาม: "มีกฎการเชื่อมเส้นเรื่อง (Choice) อะไรบ้างที่ระบบตรวจสอบ?"]
//
// ฟังก์ชัน: validateChoiceEndpoints
// ตรวจสอบความถูกต้องของโหนดต้นทางและปลายทาง:
// 1. from_scene และ to_scene ต้องมีอยู่ในระบบจริง
// 2. ทั้ง 2 ฉากต้องอยู่ในนิยายเรื่องเดียวกัน (ห้ามข้าม NovelID)
// 3. ฉากต้นทางกับปลายทางต้องไม่ใช่ฉากเดียวกัน (ห้าม Self-loop)
// 4. ฉากต้นทางต้องไม่ใช่ "ฉากจบ (Ending)" -> เพราะฉากจบคือสิ้นสุดเรื่องแล้ว ห้ามมีตัวเลือกต่อ
// 5. ฉากปลายทางต้องไม่ใช่ "ฉากเริ่มต้น (Start Scene)" -> เพราะฉากเริ่มเรื่องมีไว้ให้เริ่ม ไม่ให้ย้อนกลับมาหา
// =========================================================================================
func (s *sceneService) validateChoiceEndpoints(repo repository.ChoiceMutationRepository, fromSceneID, toSceneID int) (*models.Scene, *models.Scene, error) {
	fromScene, err := repo.GetSceneByID(fromSceneID)
	if err != nil {
		return nil, nil, ErrChoiceFromSceneMissing
	}
	toScene, err := repo.GetSceneByID(toSceneID)
	if err != nil {
		return nil, nil, ErrChoiceToSceneMissing
	}
	if fromScene.NovelID != toScene.NovelID {
		return nil, nil, ErrChoiceCrossNovel
	}
	if fromSceneID == toSceneID {
		return nil, nil, ErrChoiceSelfLoop
	}
	if fromScene.Type == "ending" {
		return nil, nil, ErrChoiceFromEnding
	}
	if toScene.Type == "start" {
		return nil, nil, ErrChoiceToStart
	}
	return fromScene, toScene, nil
}

func (s *sceneService) GetChoiceByID(choiceID int) (*models.Choice, error) {
	return s.repo.GetChoiceByID(choiceID)
}

func (s *sceneService) UpdateChoice(choice models.Choice) error {
	choice.Label = strings.TrimSpace(choice.Label)
	if err := validateChoiceLabelLength(choice.Label); err != nil {
		return err
	}

	existingChoice, err := s.repo.GetChoiceByID(choice.ChoiceID)
	if err != nil {
		return ErrChoiceNotFound
	}
	fromScene, err := s.repo.GetSceneByID(existingChoice.FromSceneID)
	if err != nil {
		return ErrChoiceNotFound
	}
	return s.repo.WithNovelGraphMutation(fromScene.NovelID, func(repo repository.ChoiceMutationRepository) error {
		return s.updateChoiceInMutation(repo, choice)
	})
}

func (s *sceneService) updateChoiceInMutation(repo repository.ChoiceMutationRepository, choice models.Choice) error {
	choice.Label = strings.TrimSpace(choice.Label)
	if err := validateChoiceLabelLength(choice.Label); err != nil {
		return err
	}
	existingChoice, err := repo.GetChoiceByID(choice.ChoiceID)
	if err != nil {
		return ErrChoiceNotFound
	}

	if choice.FromSceneID == 0 {
		choice.FromSceneID = existingChoice.FromSceneID
	} else if choice.FromSceneID != existingChoice.FromSceneID {
		return ErrChoiceWrongOrigin
	}
	if choice.ToSceneID == 0 {
		choice.ToSceneID = existingChoice.ToSceneID
	}

	fromScene, _, err := s.validateChoiceEndpoints(repo, choice.FromSceneID, choice.ToSceneID)
	if err != nil {
		return err
	}

	edges, err := repo.GetEdgesByNovelID(fromScene.NovelID)
	if err != nil {
		return fmt.Errorf("get edges for choice validation: %w", err)
	}
	for _, edge := range edges {
		if edge.ChoiceID != existingChoice.ChoiceID &&
			edge.FromID == choice.FromSceneID &&
			edge.ToID == choice.ToSceneID &&
			edge.Label == choice.Label {
			return ErrChoiceDuplicate
		}
	}

	reverseExists, err := repo.CheckChoiceExists(choice.ToSceneID, choice.FromSceneID, "")
	if err != nil {
		return fmt.Errorf("check reverse choice: %w", err)
	}
	if reverseExists {
		return ErrChoiceReverse
	}

	// ตรวจ DAG เฉพาะกรณีที่มีการเปลี่ยนต้นทางหรือปลายทาง
	// ถ้าแก้แค่ Label ไม่จำเป็นต้อง DFS ใหม่
	shouldValidateDAG := choice.FromSceneID != existingChoice.FromSceneID || choice.ToSceneID != existingChoice.ToSceneID
	if shouldValidateDAG {
		filteredEdges := make([]models.SceneEdge, 0, len(edges))
		for _, edge := range edges {
			if edge.FromID == existingChoice.FromSceneID &&
				edge.ToID == existingChoice.ToSceneID &&
				edge.Label == existingChoice.Label {
				continue
			}
			filteredEdges = append(filteredEdges, edge)
		}

		if s.wouldCreateCycle(choice.FromSceneID, choice.ToSceneID, filteredEdges) {
			return ErrChoiceCycle
		}
	}

	return repo.UpdateChoice(choice)
}

func (s *sceneService) DeleteChoice(choiceID int) error {
	choice, err := s.repo.GetChoiceByID(choiceID)
	if err != nil {
		return err
	}
	fromScene, err := s.repo.GetSceneByID(choice.FromSceneID)
	if err != nil {
		return err
	}
	return s.repo.WithNovelGraphMutation(fromScene.NovelID, func(repo repository.ChoiceMutationRepository) error {
		return repo.DeleteChoice(choiceID)
	})
}

func (s *sceneService) SyncSceneChoices(fromSceneID int, rawChoices []interface{}) (*models.ChoiceDiff, error) {
	fromScene, err := s.repo.GetSceneByID(fromSceneID)
	if err != nil {
		return nil, err
	}

	var diff *models.ChoiceDiff
	err = s.repo.WithNovelGraphMutation(fromScene.NovelID, func(repo repository.ChoiceMutationRepository) error {
		var err error
		diff, err = s.syncSceneChoicesInMutation(repo, fromSceneID, rawChoices)
		return err
	})
	return diff, err
}

func (s *sceneService) syncSceneChoicesInMutation(repo repository.ChoiceMutationRepository, fromSceneID int, rawChoices []interface{}) (*models.ChoiceDiff, error) {
	existingChoices, err := repo.GetChoicesBySceneID(fromSceneID)
	if err != nil {
		return nil, err
	}

	existingMap := make(map[int]models.Choice, len(existingChoices))
	for _, ec := range existingChoices {
		existingMap[ec.ChoiceID] = ec
	}

	incomingChoiceIDs := map[int]struct{}{}
	diff := &models.ChoiceDiff{}

	for _, raw := range rawChoices {
		choiceMap, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		var choice models.Choice
		choice.FromSceneID = fromSceneID

		if idVal, ok := choiceMap["choice_id"]; ok {
			switch v := idVal.(type) {
			case float64:
				choice.ChoiceID = int(v)
			case int:
				choice.ChoiceID = v
			case string:
				if parsed, err := strconv.Atoi(v); err == nil {
					choice.ChoiceID = parsed
				}
			}
		} else if idVal, ok := choiceMap["id"]; ok {
			switch v := idVal.(type) {
			case float64:
				choice.ChoiceID = int(v)
			case int:
				choice.ChoiceID = v
			case string:
				if parsed, err := strconv.Atoi(v); err == nil {
					choice.ChoiceID = parsed
				}
			}
		}

		if labelVal, ok := choiceMap["label"]; ok {
			choice.Label = strings.TrimSpace(fmt.Sprint(labelVal))
		} else if textVal, ok := choiceMap["text"]; ok {
			choice.Label = strings.TrimSpace(fmt.Sprint(textVal))
		}

		if toSceneID, ok := choiceMap["to_scene_id"]; ok {
			switch v := toSceneID.(type) {
			case float64:
				choice.ToSceneID = int(v)
			case int:
				choice.ToSceneID = v
			case string:
				if parsed, err := strconv.Atoi(v); err == nil {
					choice.ToSceneID = parsed
				}
			}
		} else if targetSubScene, ok := choiceMap["targetSubScene"]; ok {
			if str, ok := targetSubScene.(string); ok {
				parts := strings.Split(str, "||")
				if len(parts) == 2 {
					if parsed, err := strconv.Atoi(parts[1]); err == nil {
						choice.ToSceneID = parsed
					}
				}
			}
		}

		if choice.ChoiceID > 0 {
			oldChoice, exists := existingMap[choice.ChoiceID]
			if !exists || oldChoice.FromSceneID != fromSceneID {
				return nil, ErrChoiceForeignToScene
			}
			incomingChoiceIDs[choice.ChoiceID] = struct{}{}
			// ตรวจสอบว่ามีการเปลี่ยนแปลงข้อมูลจริงหรือไม่ (label หรือ to_scene_id)
			if oldChoice.Label != choice.Label || oldChoice.ToSceneID != choice.ToSceneID {
				if err := s.updateChoiceInMutation(repo, choice); err != nil {
					return nil, err
				}
				diff.UpdatedCount++
			}
			continue
		}

		// สร้างใหม่เฉพาะเมื่อมีข้อมูลปลายทางและข้อความตัวเลือก
		if choice.Label == "" || choice.ToSceneID == 0 {
			continue
		}

		if _, err := s.createChoiceInMutation(repo, choice); err != nil {
			return nil, err
		}
		diff.CreatedCount++
	}

	for _, existing := range existingChoices {
		if _, ok := incomingChoiceIDs[existing.ChoiceID]; !ok {
			if err := repo.DeleteChoice(existing.ChoiceID); err != nil {
				return nil, err
			}
			diff.DeletedCount++
		}
	}

	return diff, nil
}
