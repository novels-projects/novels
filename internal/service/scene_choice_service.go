package service

import (
	"errors"
	"fmt"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"strconv"
	"strings"
)

func (s *sceneService) wouldCreateCycle(fromSceneID, toSceneID int, edges []models.SceneEdge) bool {
	if fromSceneID == 0 || toSceneID == 0 || fromSceneID == toSceneID {
		return false
	}

	adjacency := make(map[int][]int)
	for _, edge := range edges {
		adjacency[edge.FromID] = append(adjacency[edge.FromID], edge.ToID)
	}

	visited := make(map[int]bool)
	stack := []int{toSceneID}

	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if current == fromSceneID {
			return true
		}
		if visited[current] {
			continue
		}
		visited[current] = true

		for _, next := range adjacency[current] {
			if !visited[next] {
				stack = append(stack, next)
			}
		}
	}

	return false
}

func (s *sceneService) CreateChoice(choice models.Choice) (int, error) {
	choice.Label = strings.TrimSpace(choice.Label)
	fromScene, err := s.repo.GetSceneByID(choice.FromSceneID)
	if err != nil {
		return 0, errors.New("ต้นทาง (from_scene_id) ไม่มีอยู่ในระบบ")
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
	fromScene, _, err := s.validateChoiceEndpoints(repo, choice.FromSceneID, choice.ToSceneID)
	if err != nil {
		return 0, err
	}

	// เช็คการย้อนกลับ (Reverse Choice)
	reverseExists, err := repo.CheckChoiceExists(choice.ToSceneID, choice.FromSceneID, "")
	if err != nil {
		return 0, fmt.Errorf("check reverse choice: %w", err)
	}
	if reverseExists {
		return 0, errors.New("ไม่สามารถสร้างทางเลือกย้อนกลับไปยังฉากต้นทางได้")
	}

	// 3. เช็คข้อมูลซ้ำ (Label ซ้ำในเส้นทางเดิม)
	exists, err := repo.CheckChoiceExists(choice.FromSceneID, choice.ToSceneID, choice.Label)
	if err != nil {
		return 0, fmt.Errorf("check duplicate choice: %w", err)
	}
	if exists {
		return 0, errors.New("ทางเลือกนี้มีอยู่แล้ว")
	}

	edges, err := repo.GetEdgesByNovelID(fromScene.NovelID)
	if err != nil {
		return 0, fmt.Errorf("get edges for cycle validation: %w", err)
	}
	if s.wouldCreateCycle(choice.FromSceneID, choice.ToSceneID, edges) {
		return 0, errors.New("การเชื่อมต่อนี้จะสร้างวงวนในกราฟเรื่องได้")
	}

	return repo.CreateChoice(choice)
}

func (s *sceneService) validateChoiceEndpoints(repo repository.ChoiceMutationRepository, fromSceneID, toSceneID int) (*models.Scene, *models.Scene, error) {
	fromScene, err := repo.GetSceneByID(fromSceneID)
	if err != nil {
		return nil, nil, errors.New("ต้นทาง (from_scene_id) ไม่มีอยู่ในระบบ")
	}
	toScene, err := repo.GetSceneByID(toSceneID)
	if err != nil {
		return nil, nil, errors.New("ปลายทาง (to_scene_id) ไม่มีอยู่ในระบบ")
	}
	if fromScene.NovelID != toScene.NovelID {
		return nil, nil, errors.New("ไม่สามารถเชื่อมโยงฉากข้ามเรื่องนิยายกันได้")
	}
	if fromSceneID == toSceneID {
		return nil, nil, errors.New("ฉากต้นทางและปลายทางห้ามเป็นฉากเดียวกัน")
	}
	if fromScene.Type == "ending" {
		return nil, nil, errors.New("ฉากต้นทางเป็นฉากจบ ไม่สามารถสร้างทางเลือกต่อไปได้")
	}
	if toScene.Type == "start" {
		return nil, nil, errors.New("ไม่สามารถสร้างทางเลือกย้อนกลับไปที่จุดเริ่มต้นของเรื่องได้")
	}
	return fromScene, toScene, nil
}

func (s *sceneService) GetChoiceByID(choiceID int) (*models.Choice, error) {
	return s.repo.GetChoiceByID(choiceID)
}

func (s *sceneService) UpdateChoice(choice models.Choice) error {
	choice.Label = strings.TrimSpace(choice.Label)

	existingChoice, err := s.repo.GetChoiceByID(choice.ChoiceID)
	if err != nil {
		return errors.New("ไม่พบทางเลือกที่ต้องการอัปเดต")
	}
	fromScene, err := s.repo.GetSceneByID(existingChoice.FromSceneID)
	if err != nil {
		return errors.New("ไม่พบทางเลือกที่ต้องการอัปเดต")
	}
	return s.repo.WithNovelGraphMutation(fromScene.NovelID, func(repo repository.ChoiceMutationRepository) error {
		return s.updateChoiceInMutation(repo, choice)
	})
}

func (s *sceneService) updateChoiceInMutation(repo repository.ChoiceMutationRepository, choice models.Choice) error {
	choice.Label = strings.TrimSpace(choice.Label)
	existingChoice, err := repo.GetChoiceByID(choice.ChoiceID)
	if err != nil {
		return errors.New("ไม่พบทางเลือกที่ต้องการอัปเดต")
	}

	if choice.FromSceneID == 0 {
		choice.FromSceneID = existingChoice.FromSceneID
	} else if choice.FromSceneID != existingChoice.FromSceneID {
		return errors.New("ทางเลือกนี้ไม่ได้อยู่ในฉากต้นทางที่ระบุ")
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
			return errors.New("ทางเลือกนี้มีอยู่แล้ว")
		}
	}

	reverseExists, err := repo.CheckChoiceExists(choice.ToSceneID, choice.FromSceneID, "")
	if err != nil {
		return fmt.Errorf("check reverse choice: %w", err)
	}
	if reverseExists {
		return errors.New("ไม่สามารถสร้างทางเลือกย้อนกลับไปยังฉากต้นทางได้")
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
			return errors.New("การเชื่อมต่อนี้จะสร้างวงวนในกราฟเรื่องได้")
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
				return nil, errors.New("ทางเลือกนี้ไม่ได้อยู่ในฉากต้นทางที่กำลังซิงก์")
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
