package service

import (
	"database/sql"
	"errors"
	"novel-be/internal/models"
	"strings"
)

// 🟢 ปรุง URL รูปภาพให้สมบูรณ์เพื่อให้ Frontend ใช้งานได้ทันที
func (s *sceneService) formatImageURL(imageName string) string {
	if imageName == "" {
		return ""
	}
	// baseURL นี้ต้องตรงกับที่ตั้งใน Docker MinIO
	baseURL := "http://localhost:9000/novel-buckets/"
	return baseURL + imageName
}

func (s *sceneService) isChapterOne(chapterID int) (bool, error) {
	var episode int
	err := s.db.QueryRow(`SELECT episode FROM chapters WHERE chapter_id = $1`, chapterID).Scan(&episode)
	if err != nil {
		return false, err
	}
	return episode == 1, nil
}

func (s *sceneService) getExistingStartSceneID(novelID int) (int, error) {
	var sceneID int
	err := s.db.QueryRow(`SELECT scene_id FROM scenes WHERE novel_id = $1 AND type = 'start' LIMIT 1`, novelID).Scan(&sceneID)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return sceneID, nil
}

func (s *sceneService) GetScene(sceneID int) (models.SceneResponse, error) {
	scene, err := s.repo.GetSceneByID(sceneID)
	if err != nil {
		return models.SceneResponse{}, err
	}
	choices, err := s.repo.GetChoicesBySceneID(sceneID)
	if err != nil {
		return models.SceneResponse{}, err
	}

	return models.SceneResponse{
		SceneID:           scene.SceneID,
		ChapterID:         scene.ChapterID,
		NovelID:           scene.NovelID,
		Title:             scene.Title,
		Content:           scene.Content,
		Type:              scene.Type,
		Status:            scene.Status,
		ImageURL:          s.formatImageURL(scene.ImageURL),
		EndingTitle:       scene.EndingTitle,
		EndingType:        scene.EndingType,
		EndingDescription: scene.EndingDescription,
		NovelTitle:        scene.NovelTitle,     // 🟢 🎯 ยัดชื่อเรื่องหลักส่งไปหน้าบ้าน
		ChapterTitle:      scene.ChapterTitle,   // 🟢 🎯 ยัดชื่อตอนย่อยส่งไปหน้าบ้าน
		ChapterEpisode:    scene.ChapterEpisode, //eww
		Choices:           choices,
	}, nil
}

func (s *sceneService) GetStartScene(novelID int) (models.SceneResponse, error) {
	scene, err := s.repo.GetStartSceneByNovelID(novelID)
	if err != nil {
		return models.SceneResponse{}, err
	}
	choices, err := s.repo.GetChoicesBySceneID(scene.SceneID)
	if err != nil {
		return models.SceneResponse{}, err
	}

	return models.SceneResponse{
		SceneID:           scene.SceneID,
		ChapterID:         scene.ChapterID,
		NovelID:           scene.NovelID,
		Title:             scene.Title,
		Content:           scene.Content,
		Type:              scene.Type,
		Status:            scene.Status,
		ImageURL:          s.formatImageURL(scene.ImageURL),
		EndingTitle:       scene.EndingTitle,
		EndingType:        scene.EndingType,
		EndingDescription: scene.EndingDescription,
		NovelTitle:        scene.NovelTitle,   // 🟢 🎯 ยัดชื่อเรื่องหลักส่งไปหน้าบ้าน
		ChapterTitle:      scene.ChapterTitle, // 🟢 🎯 ยัดชื่อตอนย่อยส่งไปหน้าบ้าน
		ChapterEpisode:    scene.ChapterEpisode,
		Choices:           choices,
	}, nil
}

func (s *sceneService) GetScenesByChapterID(chapterID int) ([]models.Scene, error) {
	return s.repo.GetScenesByChapterID(chapterID)
}

func (s *sceneService) CreateScene(scene models.Scene) (int, error) {
	// ตัดช่องว่างหน้า-หลังชื่อฉาก ป้องกัน "ฉากที่ 1" กับ "ฉากที่ 1 " ซ้ำกัน
	scene.Title = strings.TrimSpace(scene.Title)
	if strings.TrimSpace(scene.Status) == "" {
		scene.Status = "draft"
	}

	count, err := s.repo.CountScenesInNovel(scene.NovelID)
	if err != nil {
		return 0, err
	}

	chapterOne, err := s.isChapterOne(scene.ChapterID)
	if err != nil {
		return 0, err
	}

	if count == 0 {
		// Automate the very first scene of the novel to start only if it belongs to chapter 1
		if chapterOne {
			scene.Type = "start"
		} else {
			scene.Type = "normal"
		}
	} else if strings.EqualFold(scene.Type, "start") {
		if !chapterOne {
			return 0, errors.New("Start scene must belong to chapter 1")
		}
		existingStartID, err := s.getExistingStartSceneID(scene.NovelID)
		if err != nil {
			return 0, err
		}
		if existingStartID != 0 {
			return 0, errors.New("Novel already has a start scene")
		}
		scene.Type = "start"
	} else if scene.Type == "" || strings.EqualFold(scene.Type, "draft") {
		scene.Type = "normal"
	}

	exists, _ := s.repo.CheckSceneExists(scene.ChapterID, scene.Title)
	if exists {
		return 0, errors.New("ฉากนี้มีอยู่แล้วในตอนเดียวกัน")
	}
	return s.repo.CreateScene(scene)
}

func (s *sceneService) UpdateScene(scene models.Scene) error {
	existing, err := s.repo.GetSceneByID(scene.SceneID)
	if err != nil {
		return err
	}

	if scene.Title != "" {
		scene.Title = strings.TrimSpace(scene.Title)
	} else {
		scene.Title = existing.Title
	}

	if scene.Content == "" {
		scene.Content = existing.Content
	}

	if strings.TrimSpace(scene.Status) == "" {
		scene.Status = existing.Status
	}

	effectiveType := existing.Type
	if strings.TrimSpace(scene.Type) != "" {
		requestedType := strings.ToLower(strings.TrimSpace(scene.Type))
		if requestedType == "start" {
			if existing.Type == "ending" {
				return errors.New("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ กรุณาเลือกฉากอื่นเป็นฉากจบ")
			}
			chapterOne, err := s.isChapterOne(existing.ChapterID)
			if err != nil {
				return err
			}
			if !chapterOne {
				return errors.New("Start scene must belong to chapter 1")
			}

			currentStartID, err := s.getExistingStartSceneID(existing.NovelID)
			if err != nil {
				return err
			}
			if currentStartID != 0 && currentStartID != existing.SceneID {
				if err := s.repo.UpdateSceneTypeByID(currentStartID, "normal"); err != nil {
					return err
				}
			}
			effectiveType = "start"
		} else if requestedType == "ending" {
			effectiveType = "ending"
		} else {
			effectiveType = requestedType
		}
	}

	if existing.Type == "start" {
		effectiveType = "start"
	}

	if effectiveType == "ending" {
		choices, err := s.repo.GetChoicesBySceneID(scene.SceneID)
		if err == nil && len(choices) > 0 {
			return errors.New("ฉากจบไม่สามารถสร้างทางเลือกต่อได้ กรุณาลบตัวเลือกในฉากนี้ออก หรือเปลี่ยนประเภทฉากเพื่อไปต่อ")
		}
	}

	scene.Type = effectiveType

	if existing.Type == "start" && scene.Type == "ending" {
		return errors.New("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ กรุณาเลือกฉากอื่นเป็นฉากจบ")
	}

	return s.repo.UpdateScene(scene)
}

func (s *sceneService) DeleteScene(sceneID int) error {
	scene, err := s.repo.GetSceneByID(sceneID)
	if err != nil {
		return err
	}

	if scene.Type == "start" {
		return errors.New("Start scene cannot be deleted")
	}

	incomingCount, err := s.repo.GetIncomingChoiceCount(sceneID)
	if err != nil {
		return err
	}
	if incomingCount > 0 {
		return errors.New("Cannot delete scene with incoming choices")
	}

	return s.repo.DeleteScene(sceneID)
}
