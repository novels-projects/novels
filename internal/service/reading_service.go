package service

import (
	"novel-be/internal/models"
	"novel-be/internal/repository"
)

type readingService struct {
	repo repository.ReadingRepository
}

func NewReadingService(repo repository.ReadingRepository) ReadingService {
	return &readingService{repo: repo}
}

// =========================================================================================
// [อาจารย์ถาม: "ระบบบันทึกความคืบหน้าการอ่าน (Reading Progress) ทำงานอย่างไร?"]
//
// โฟลเดอร์: internal/service/reading_service.go
// หลักการออกแบบ:
// 1. ตาราง reading_progress จะเก็บ `current_scene_id` ซึ่งเป็น "ฉากปัจจุบันที่กำลังอ่านอยู่"
//    (ไม่ใช่ฉากล่าสุดที่เคยกดย้อนดู) เพื่อให้ปุ่ม "อ่านต่อ (Continue Reading)" พาไปฉากปัจจุบันได้ถูกต้อง 100%
// 2. แยกประวัติการเลือก (choice_history) ออกเป็นอีกตาราง เพื่อบันทึกเส้นทางการตัดสินใจของผู้อ่าน
// 3. แยกการปลดล็อกฉากจบ (user_endings) สำหรับระบบสะสมฉากจบ (Ending Collection)
// =========================================================================================

// GetProgress ดึงข้อมูลฉากปัจจุบันที่อ่านค้างไว้ ใช้สำหรับปุ่ม "อ่านต่อ (Continue Reading)"
func (s *readingService) GetProgress(userID, novelID int) (*models.ReadingProgress, error) {
	return s.repo.GetReadingProgress(userID, novelID)
}

// SaveProgress อัปเดตฉากปัจจุบันที่อ่านถึง (current_scene_id) เมื่อผู้อ่านตัดสินใจเลือก Choice เดินหน้า
func (s *readingService) SaveProgress(progress models.ReadingProgress) error {
	return s.repo.SaveReadingProgress(progress.UserID, progress.NovelID, progress.CurrentSceneID)
}

// ResetProgress รีเซ็ตการอ่านเพื่อเริ่มเรื่องใหม่ตั้งแต่ฉากเริ่มต้น
func (s *readingService) ResetProgress(userID, novelID int) error {
	return s.repo.ResetReadingProgress(userID, novelID)
}

// GetReadingHistory ดึงรายการนิยายที่เคยอ่านมาแสดงในหน้าประวัติ (เปิดดูเฉยๆ ไม่เปลี่ยน Progress ปัจจุบัน)
func (s *readingService) GetReadingHistory(userID int) ([]models.Novel, error) {
	return s.repo.GetReadingHistory(userID)
}

// RecordChoiceHistory บันทึกประวัติว่าในฉากไหน ผู้อ่านตัดสินใจเลือก Choice อะไร
func (s *readingService) RecordChoiceHistory(history models.ChoiceHistory) error {
	return s.repo.InsertChoiceHistory(history)
}

// RecordEnding บันทึกการปลดล็อกฉากจบเข้าคอลเลกชันส่วนตัวของผู้ใช้ (user_endings)
func (s *readingService) RecordEnding(userID, novelID, sceneID int) error {
	return s.repo.InsertUserEnding(userID, novelID, sceneID)
}

func (s *readingService) DeleteReadingHistoryByNovel(userID, novelID int) (bool, error) {
	return s.repo.DeleteReadingHistoryByNovel(userID, novelID)
}

func (s *readingService) DeleteReadingHistoryByUser(userID int, novelIDs []int) (int, error) {
	return s.repo.DeleteReadingHistoryByUser(userID, novelIDs)
}
