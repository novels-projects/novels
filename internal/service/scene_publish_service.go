package service

import (
	"fmt"
	"strings"

	"novel-be/internal/models"
)

type PublishIssue struct {
	Severity  string // "blocking" or "warning"
	Code      string
	Message   string
	SceneID   *int
	ChapterID *int
}

type PublishValidationResult struct {
	CanPublish bool
	Issues     []PublishIssue
}

// sceneInfo เก็บข้อมูลฉากที่โหลดจากฐานข้อมูล ใช้ทั้งในการโหลดและการตัดสินใจการเผยแพร่
type sceneInfo struct {
	sceneID   int
	chapterID int
	sceneType string
	status    string
}

// publishInput คือข้อมูลทั้งหมดที่โหลดจากฐานข้อมูลแล้ว ใช้ตัดสินใจความสามารถในการเผยแพร่
// (แยกส่วนการโหลดข้อมูล (DB-coupled) ออกจากตรรกะการตัดสินใจ (pure) เพื่อให้ทดสอบได้)
type publishInput struct {
	sceneByID        map[int]sceneInfo
	sceneIDs         []int
	chapterIDs       []int
	chapterStatus    map[int]string
	scenesPerChapter map[int]int
	edges            []models.SceneEdge
	novelIsPublished bool
	novelIsCompleted bool
}

// =========================================================================================
// [อาจารย์ถาม: "ก่อนที่นิยายจะกด Publish ได้ มีการตรวจเช็คความถูกต้องของเนื้อเรื่องยังไง?"]
//
// ฟังก์ชัน: evaluatePublishability
// ตรวจสอบความสมบูรณ์ของโครงสร้างนิยาย แบ่งผลการตรวจเป็น 2 ระดับ:
// 1. "blocking" (ขัดขวางการเผยแพร่): หากพบข้อผิดพลาด จะไม่อนุญาตให้ Publish เด็ดขาด (CanPublish = false)
//   - ENDING_HAS_OUTGOING_CHOICE: ฉากจบมีตัวเลือกชี้ออก (ฉากจบต้องไม่มีทางไปต่อ)
//   - COMPLETED_WITHOUT_ENDING: ตั้งสถานะว่านิยายจบแล้ว แต่ไม่มีฉากจบสักฉากเดียว
//
// 2. "warning" (เตือนเฉยๆ ไม่ขัดขวาง): อนุญาตให้ Publish ได้ แต่ส่งคำเตือนให้นักเขียนทราบ
//   - MISSING_START_SCENE: ยังไม่ได้กำหนดฉากเริ่มต้น
//   - SCENE_UNREACHABLE: มีฉากลอยเคว้ง (ฉากที่อ่านจากฉากเริ่มแล้วเดินมาไม่ถึง) -> เช็คด้วย BFS
//   - CHAPTER_WITHOUT_SCENES: ตอนที่ว่างเปล่าไม่มีฉาก
//
// =========================================================================================
func evaluatePublishability(in publishInput) PublishValidationResult {
	result := PublishValidationResult{
		CanPublish: true,
		Issues:     []PublishIssue{},
	}

	addIssue := func(severity, code, message string, sceneID, chapterID *int) {
		result.Issues = append(result.Issues, PublishIssue{
			Severity:  severity,
			Code:      code,
			Message:   message,
			SceneID:   sceneID,
			ChapterID: chapterID,
		})
		if severity == "blocking" {
			result.CanPublish = false
		}
	}

	sceneByID := in.sceneByID
	sceneIDs := in.sceneIDs
	chapterIDs := in.chapterIDs
	chapterStatus := in.chapterStatus
	scenesPerChapter := in.scenesPerChapter
	novelIsPublished := in.novelIsPublished
	novelIsCompleted := in.novelIsCompleted

	outgoingCount := make(map[int]int)
	for _, edge := range in.edges {
		outgoingCount[edge.FromID]++
	}

	// 1. ENDING_HAS_OUTGOING_CHOICE (Blocking)
	for _, sID := range sceneIDs {
		sc := sceneByID[sID]
		if strings.EqualFold(sc.sceneType, "ending") && outgoingCount[sID] > 0 {
			sceneIDVal := sID
			chapterIDVal := sc.chapterID
			addIssue(
				"blocking",
				"ENDING_HAS_OUTGOING_CHOICE",
				fmt.Sprintf("ฉากจบ (Scene ID %d) มีตัวเลือกชี้ออกจากฉาก กรุณาลบตัวเลือกในฉากจบนี้ออก", sID),
				&sceneIDVal,
				&chapterIDVal,
			)
		}
	}

	// 2. COMPLETED_WITHOUT_ENDING (Blocking)
	hasEndingScene := false
	for _, sc := range sceneByID {
		if strings.EqualFold(sc.sceneType, "ending") {
			hasEndingScene = true
			break
		}
	}
	if novelIsCompleted && !hasEndingScene {
		addIssue(
			"blocking",
			"COMPLETED_WITHOUT_ENDING",
			"นิยายถูกตั้งค่าว่าจบแล้ว (is_completed = true) แต่ยังไม่มีฉากจบ (ending scene) ในเรื่อง กรุณาเพิ่มฉากจบอย่างน้อย 1 ฉาก",
			nil,
			nil,
		)
	}

	// 3. (Published scene -> draft scene ไม่บล็อกการเผยแพร่)

	// 4. SCENE_UNREACHABLE (Warning)
	// [ขั้นตอนวิธี Breadth-First Search (BFS) ตรวจหาฉากลอยเคว้ง]:
	// - เริ่มต้นนำฉาก start scene ใส่ลงใน Queue
	// - วิ่งแผ่ขยายตาม Choice ไปยังฉากถัดไปเรื่อยๆ (Reachable = true)
	// - เมื่อค้นหาเสร็จ ฉากไหนที่ Reachable ยังคงเป็น false แสดงว่าไม่มีเส้นทางใดเชื่อมโยงมาถึงฉากนี้ได้
	adjacency := make(map[int][]int)
	for _, edge := range in.edges {
		adjacency[edge.FromID] = append(adjacency[edge.FromID], edge.ToID)
	}

	var startSceneIDs []int
	for _, sID := range sceneIDs {
		if strings.EqualFold(sceneByID[sID].sceneType, "start") {
			startSceneIDs = append(startSceneIDs, sID)
		}
	}
	if len(startSceneIDs) == 0 {
		addIssue(
			"warning",
			"MISSING_START_SCENE",
			"นิยายยังไม่มีฉากเริ่มต้น (สามารถเผยแพร่ได้ตาม FR-STRUCT-10)",
			nil,
			nil,
		)
	}

	if len(startSceneIDs) > 0 {
		reachable := make(map[int]bool)
		queue := make([]int, 0, len(startSceneIDs))
		for _, startID := range startSceneIDs {
			reachable[startID] = true
			queue = append(queue, startID)
		}

		// วิ่งสำรวจตาม Queue ทีละชั้น (BFS)
		for len(queue) > 0 {
			curr := queue[0]
			queue = queue[1:]

			for _, nextID := range adjacency[curr] {
				if !reachable[nextID] {
					reachable[nextID] = true
					queue = append(queue, nextID)
				}
			}
		}

		for _, sID := range sceneIDs {
			if !reachable[sID] {
				sc := sceneByID[sID]
				sceneIDVal := sID
				chapterIDVal := sc.chapterID
				addIssue(
					"warning",
					"SCENE_UNREACHABLE",
					fmt.Sprintf("ฉาก (Scene ID %d) ไม่สามารถเข้าถึงได้จากฉากเริ่มต้น (start scene)", sID),
					&sceneIDVal,
					&chapterIDVal,
				)
			}
		}
	}

	// 5. CHAPTER_WITHOUT_SCENES (Warning)
	for _, cID := range chapterIDs {
		if scenesPerChapter[cID] == 0 {
			chapterIDVal := cID
			addIssue(
				"warning",
				"CHAPTER_WITHOUT_SCENES",
				fmt.Sprintf("ตอน (Chapter ID %d) ยังไม่มีฉากอยู่ในตอนนี้ กรุณาเพิ่มฉากในตอนหรือลบตอนนี้ออก", cID),
				nil,
				&chapterIDVal,
			)
		}
	}

	// 6. PUBLISHED_SCENE_IN_UNPUBLISHED_CHAPTER (Warning)
	// 7. PUBLISHED_SCENE_IN_UNPUBLISHED_NOVEL (Warning)
	for _, sID := range sceneIDs {
		sc := sceneByID[sID]
		if !strings.EqualFold(sc.status, "published") {
			continue
		}

		cStatus, hasChapter := chapterStatus[sc.chapterID]
		if hasChapter && !strings.EqualFold(cStatus, "published") {
			sceneIDVal := sID
			chapterIDVal := sc.chapterID
			addIssue(
				"warning",
				"PUBLISHED_SCENE_IN_UNPUBLISHED_CHAPTER",
				fmt.Sprintf("ฉากที่เผยแพร่แล้ว (Scene ID %d) อยู่ในตอนที่ยังไม่ได้เผยแพร่ (Chapter ID %d)", sID, sc.chapterID),
				&sceneIDVal,
				&chapterIDVal,
			)
		}

		if !novelIsPublished {
			sceneIDVal := sID
			chapterIDVal := sc.chapterID
			addIssue(
				"warning",
				"PUBLISHED_SCENE_IN_UNPUBLISHED_NOVEL",
				fmt.Sprintf("ฉากที่เผยแพร่แล้ว (Scene ID %d) อยู่ในนิยายที่ยังไม่ได้เผยแพร่ (is_published = false)", sID),
				&sceneIDVal,
				&chapterIDVal,
			)
		}
	}

	// 8. PUBLISHED_CHAPTER_IN_UNPUBLISHED_NOVEL (Warning)
	for _, cID := range chapterIDs {
		cStatus := chapterStatus[cID]
		if strings.EqualFold(cStatus, "published") && !novelIsPublished {
			chapterIDVal := cID
			addIssue(
				"warning",
				"PUBLISHED_CHAPTER_IN_UNPUBLISHED_NOVEL",
				fmt.Sprintf("ตอนที่เผยแพร่แล้ว (Chapter ID %d) อยู่ในนิยายที่ยังไม่ได้เผยแพร่ (is_published = false)", cID),
				nil,
				&chapterIDVal,
			)
		}
	}

	return result
}

func (s *sceneService) ValidateNovelPublishability(novelID int) PublishValidationResult {
	result := PublishValidationResult{
		CanPublish: true,
		Issues:     []PublishIssue{},
	}

	addIssue := func(severity, code, message string, sceneID, chapterID *int) {
		result.Issues = append(result.Issues, PublishIssue{
			Severity:  severity,
			Code:      code,
			Message:   message,
			SceneID:   sceneID,
			ChapterID: chapterID,
		})
		if severity == "blocking" {
			result.CanPublish = false
		}
	}

	nodes, err := s.repo.GetNodesByNovelID(novelID)
	if err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถโหลดข้อมูลฉากของนิยายได้: %v", err), nil, nil)
		return result
	}

	edges, err := s.repo.GetEdgesByNovelID(novelID)
	if err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถโหลดข้อมูลทางเลือกของนิยายได้: %v", err), nil, nil)
		return result
	}

	sceneByID := make(map[int]sceneInfo, len(nodes))
	scenesPerChapter := make(map[int]int)

	sceneRows, err := s.db.Query(`
SELECT scene_id, chapter_id, type, status
FROM scenes
WHERE novel_id = $1
ORDER BY scene_id ASC
`, novelID)
	if err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถโหลดสถานะฉากได้: %v", err), nil, nil)
		return result
	}
	defer sceneRows.Close()

	var sceneIDs []int
	for sceneRows.Next() {
		var sID, cID int
		var sType, status string
		if err := sceneRows.Scan(&sID, &cID, &sType, &status); err != nil {
			addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถอ่านข้อมูลฉากได้: %v", err), nil, nil)
			return result
		}
		sceneByID[sID] = sceneInfo{
			sceneID:   sID,
			chapterID: cID,
			sceneType: sType,
			status:    status,
		}
		scenesPerChapter[cID]++
		sceneIDs = append(sceneIDs, sID)
	}
	if err := sceneRows.Err(); err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถอ่านข้อมูลฉากได้: %v", err), nil, nil)
		return result
	}

	chapterStatus := make(map[int]string)
	var chapterIDs []int
	chapterRows, err := s.db.Query(`
SELECT chapter_id, status
FROM chapters
WHERE novel_id = $1
ORDER BY chapter_id ASC
`, novelID)
	if err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถโหลดตอนของนิยายได้: %v", err), nil, nil)
		return result
	}
	defer chapterRows.Close()

	for chapterRows.Next() {
		var cID int
		var status string
		if err := chapterRows.Scan(&cID, &status); err != nil {
			addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถอ่านข้อมูลตอนได้: %v", err), nil, nil)
			return result
		}
		chapterStatus[cID] = status
		chapterIDs = append(chapterIDs, cID)
	}
	if err := chapterRows.Err(); err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถอ่านข้อมูลตอนได้: %v", err), nil, nil)
		return result
	}

	var novelIsPublished, novelIsCompleted bool
	err = s.db.QueryRow(`
SELECT is_published, is_completed
FROM novels
WHERE novel_id = $1
`, novelID).Scan(&novelIsPublished, &novelIsCompleted)
	if err != nil {
		addIssue("blocking", "VALIDATION_ERROR", fmt.Sprintf("ไม่สามารถโหลดข้อมูลนิยายได้: %v", err), nil, nil)
		return result
	}

	return evaluatePublishability(publishInput{
		sceneByID:        sceneByID,
		sceneIDs:         sceneIDs,
		chapterIDs:       chapterIDs,
		chapterStatus:    chapterStatus,
		scenesPerChapter: scenesPerChapter,
		edges:            edges,
		novelIsPublished: novelIsPublished,
		novelIsCompleted: novelIsCompleted,
	})
}

func (s *sceneService) ValidateStoryForPublish(novelID int) PublishValidationResult {
	return s.ValidateNovelPublishability(novelID)
}
