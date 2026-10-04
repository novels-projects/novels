package handlers

import (
	"log"
	"net/http"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/service"
)

// GET /novels/{id}
func GetNovelDetailHandler(novelService service.NovelService, sceneService service.SceneService, socialService service.SocialService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		id, err := extractIDFromPath(r.URL.Path, "/novels/")
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "invalid novel id", err.Error())
			return
		}

		// ดึงข้อมูลรายละเอียดนิยายดั้งเดิม
		novel, err := novelService.GetNovelDetail(id)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "novel not found", err.Error())
			return
		}

		novelModel, isNovel := novel.(*models.Novel)
		isOwnerOrAdmin := false

		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if ok && ctxUserID != 0 {
			if role, roleOk := middleware.GetRoleFromContext(r.Context()); roleOk && role == "admin" {
				isOwnerOrAdmin = true
			} else if isNovel && writerService != nil {
				writer, wErr := writerService.GetWriterByUserID(int(ctxUserID))
				if wErr == nil && writer != nil && writer.WriterID == novelModel.AuthorID {
					isOwnerOrAdmin = true
				}
			}
		}

		if !isOwnerOrAdmin {
			if !isNovel || !novelModel.IsPublished {
				RespondWithError(w, http.StatusNotFound, "novel not found", "novel not found")
				return
			}
		}

		// เพิ่มยอดวิวเมื่อผู้ใช้เข้าหน้านิยาย
		if err := novelService.IncrementViews(id); err != nil {
			// ถ้าเพิ่มยอดวิวล้มเหลว ไม่ขัดขวางการแสดงรายละเอียดนิยาย
			// สามารถ log เพิ่มได้ที่ middleware หรือ logger ภายนอก
		}

		// ถ้ามี user_id มาให้ตรวจว่า user นี้กดไลค์นิยายเรื่องนี้หรือยัง
		userID := 0
		if ctxUserID, ok := middleware.GetUserIDFromContext(r.Context()); ok && ctxUserID > 0 {
			userID = int(ctxUserID)
		}
		if userID > 0 {
			liked, err := socialService.IsLikeExists(userID, id)
			if err == nil {
				if novelModel, ok := novel.(*models.Novel); ok {
					novelModel.IsLiked = liked
				}
			}
		}

		// =================================================================
		// 🎯 ส่วนที่เพิ่ม: คำนวณสถิติเพื่อส่งไปให้หน้ารายละเอียดนิยาย (Novel Detail)
		// =================================================================

		visitedCount := 0
		totalScenes := 0
		discoveredChoices := 0
		totalChoices := 0
		unlockedEndings := 0
		totalEndings := 0

		// เรียกใช้สิทธิ์บริการ GetStoryTree ตัวเดิมที่เพิ่งเขียนเสร็จมาคำนวณสด
		tree, err := sceneService.GetStoryTree(id, userID)
		if err == nil {
			totalScenes = len(tree.Nodes)
			totalChoices = len(tree.Edges)

			unlockedNodesMap := make(map[int]bool)

			for _, rawNode := range tree.Nodes {
				if rawNode.Type == "ending" {
					totalEndings++
					if rawNode.IsUnlocked {
						unlockedEndings++
					}
				}

				// เงื่อนไขเปิดไฟโหนดเหมือนในหน้าผังกิ่งไม้
				isNodeAccessible := rawNode.IsUnlocked || rawNode.Type == "start"
				if isNodeAccessible {
					visitedCount++
					unlockedNodesMap[rawNode.ID] = true
				}
			}

			// คำนวณเส้นเลือกที่ผ่าน
			for _, edge := range tree.Edges {
				if unlockedNodesMap[edge.FromID] {
					discoveredChoices++
				}
			}
		}

		endings, err := sceneService.GetEndingsByNovelID(id, userID)
		if err != nil {
			endings = []models.EndingScene{}
		}

		// ประกอบร่าง Response ใหม่ ผนึกข้อมูลนิยาย และก้อนสถิติจริงส่งออกไปหา React
		finalDetailResponse := map[string]interface{}{
			"novel":              novel,             // ข้อมูลนิยายก้อนเดิม (ชื่อเรื่อง, คำโปรย, ยอดวิว ฯลฯ)
			"visited_scenes":     visitedCount,      // จำนวนตอนที่อ่านแล้ว (การ์ดชมพูซ้าย)
			"total_scenes":       totalScenes,       // จำนวนตอนทั้งหมด
			"discovered_choices": discoveredChoices, // ช้อยส์ที่เจอ (ช้อยส์ที่ผ่านแล้ว)
			"total_choices":      totalChoices,      // ช้อยส์ทั้งหมด
			"unlocked_endings":   unlockedEndings,   // ฉากจบที่ปลด
			"total_endings":      totalEndings,      // ฉากจบทั้งหมด
			"endings":            endings,
		}

		// ถ้ามี user_id ให้ตรวจว่าผู้ใช้คนนี้ติดตามนักเขียนของนิยายเรื่องนี้หรือไม่
		if userID > 0 {
			// novel might be *models.Novel
			if novelModel, ok := novel.(*models.Novel); ok {
				following := false
				writers, err := socialService.GetFollowingWriters(userID)
				if err == nil {
					for _, w := range writers {
						if w.WriterID == novelModel.AuthorID {
							following = true
							break
						}
					}
				}
				finalDetailResponse["is_following"] = following
				// Log for debugging follow state
				log.Printf("GetNovelDetailHandler: user=%d author=%d is_following=%v", userID, novelModel.AuthorID, following)
			}
		}
		RespondWithJSON(w, http.StatusOK, finalDetailResponse)
	}
}
