package service

import (
	"database/sql"
	"novel-be/internal/models"
)

func truncateContent(content string, maxLen int) string {
	runes := []rune(content)
	if len(runes) <= maxLen {
		return content
	}
	return string(runes[:maxLen]) + "..."
}

func (s *sceneService) GetStoryTree(novelID int, userID int) (models.StoryTreeResponse, error) {
	// 1. ดึง Nodes มาก่อน
	nodes, err := s.repo.GetNodesByNovelIDForUser(novelID, userID)
	if err != nil {
		return models.StoryTreeResponse{}, err
	}

	// ป้องกันกรณีข้อมูลซ้ำจาก query, ให้คงเฉพาะ Scene ID เดียวกันไว้ครั้งเดียว
	uniqueNodes := make([]models.SceneNode, 0, len(nodes))
	seenSceneIDs := make(map[int]struct{}, len(nodes))
	for _, node := range nodes {
		if _, ok := seenSceneIDs[node.ID]; ok {
			continue
		}
		seenSceneIDs[node.ID] = struct{}{}
		uniqueNodes = append(uniqueNodes, node)
	}
	nodes = uniqueNodes

	// 🟢 ดึงชื่อเรื่องนิยายและ Current Scene ID
	var novelTitle string
	var currentSceneID int

	novelErr := s.db.QueryRow(
		`SELECT novel_id, title FROM novels WHERE novel_id = $1`,
		novelID,
	).Scan(&novelID, &novelTitle)

	if novelErr != nil && novelErr != sql.ErrNoRows {
		return models.StoryTreeResponse{}, novelErr
	}

	// 🟢 ถ้ามี userID ให้ดึง current scene จาก reading progress
	if userID > 0 {
		_ = s.db.QueryRow(
			`SELECT current_scene_id FROM reading_progress 
			 WHERE user_id = $1 AND novel_id = $2 AND updated_at IS NOT NULL`,
			userID, novelID,
		).Scan(&currentSceneID)
	}

	// ถ้าไม่มี user_id ส่งมา แปลว่าเรียกจากโหมด writer/preview
	// ให้แสดงโหนดทั้งหมดเป็นปลดล็อก เพื่อให้ผู้เขียนดูโครงสร้างทั้งหมด
	if userID <= 0 {
		for i := range nodes {
			nodes[i].IsUnlocked = true
		}
	}

	// 2. 🟢 สร้าง Map เพื่อจดจำสถานะและข้อมูลฉาก (ประกาศตัวแปรที่นี่)
	unlockedMap := make(map[int]bool)
	sceneInfoMap := make(map[int]models.SceneNode)

	for i := range nodes {
		// จดใส่ Map ไว้ว่า ID นี้ Unlock หรือยัง
		unlockedMap[nodes[i].ID] = nodes[i].IsUnlocked
		sceneInfoMap[nodes[i].ID] = nodes[i]

		// ถ้ายังไม่ Unlock ให้เปลี่ยนชื่อเป็น "🔒..."
		if !nodes[i].IsUnlocked {
			nodes[i].Label = "🔒 ยังไม่ได้ปลดล็อก"
		}
	}

	// 3. ดึง Edges (เส้นเชื่อม)
	edges, err := s.repo.GetEdgesByNovelID(novelID)
	if err != nil {
		return models.StoryTreeResponse{}, err
	}

	// 🎯 สร้างเส้นเชื่อมพร้อมข้อมูลฉากต้นทางและปลายทาง
	enrichedEdges := make([]models.SceneEdge, 0, len(edges))

	for _, edge := range edges {
		toID := edge.ToID
		fromID := edge.FromID

		// ถ้าฉากปลายทางยังไม่เคยถูกปลดล็อก ให้ซ่อนชื่อทางเลือกเป็น ???
		if !unlockedMap[toID] {
			edge.Label = "???"
		}

		// เติมข้อมูลฉากต้นทางและปลายทาง
		fromScene := sceneInfoMap[fromID]
		toScene := sceneInfoMap[toID]

		edge.FromSceneTitle = fromScene.Title
		edge.ToSceneTitle = toScene.Title
		edge.FromChapterTitle = fromScene.ChapterTitle
		edge.ToChapterTitle = toScene.ChapterTitle
		edge.FromChapterEpisode = fromScene.ChapterEpisode
		edge.ToChapterEpisode = toScene.ChapterEpisode
		edge.FromSceneNumberInChapter = fromScene.SceneNumberInChapter
		edge.ToSceneNumberInChapter = toScene.SceneNumberInChapter

		enrichedEdges = append(enrichedEdges, edge)
	}

	secureNodes := make([]models.SceneNode, 0, len(nodes))
	for _, rawNode := range nodes {
		isNodeAccessible := rawNode.IsUnlocked || rawNode.Type == "start"

		node := models.SceneNode{
			ID:             rawNode.ID,
			Type:           rawNode.Type,
			IsUnlocked:     isNodeAccessible,
			Status:         rawNode.Status,
			ChapterTitle:   rawNode.ChapterTitle,
			ChapterEpisode: rawNode.ChapterEpisode,
			NodeX:          rawNode.NodeX,
			NodeY:          rawNode.NodeY,
		}

		if isNodeAccessible {
			node.Label = rawNode.Label
			if node.Label == "" {
				node.Label = "จุดเริ่มต้นเนื้อเรื่อง"
			}

			node.Title = rawNode.Title
			if node.Title == "" {
				node.Title = "บทนำ / ซีนเปิดตัว"
			}

			if rawNode.Content != "" {
				node.Content = truncateContent(rawNode.Content, 45)
			} else {
				node.Content = "ร่วมเลือกเส้นทางเพื่อดำเนินเนื้อเรื่องต่อไป..."
			}

		} else {
			node.Label = "🔒 ยังไม่ได้ปลดล็อก"
			node.Title = "เนื้อเรื่องยังไม่เปิดเผย"
			node.Content = "เดินเรื่องตามเงื่อนไขในฉากก่อนหน้าเพื่อเปิดเผยเส้นทางนี้"
		}

		secureNodes = append(secureNodes, node)
	}

	return models.StoryTreeResponse{
		NovelTitle:     novelTitle,
		CurrentSceneID: currentSceneID,
		Nodes:          secureNodes,
		Edges:          enrichedEdges,
	}, nil
}

func (s *sceneService) GetEndingsByNovelID(novelID int, userID int) ([]models.EndingScene, error) {
	return s.repo.GetEndingsByNovelIDForUser(novelID, userID)
}

func (s *sceneService) UpdateScenePosition(sceneID int, nodeX *float64, nodeY *float64) error {
	return s.repo.UpdateScenePosition(sceneID, nodeX, nodeY)
}
