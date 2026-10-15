package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/service"
)

var (
	errOwnershipUnauthorized = errors.New("unauthorized")
	errOwnershipForbidden    = errors.New("forbidden")
)

// =========================================================================================
// [อาจารย์ถาม: "ถ้านักเขียน A พยายามแก้ไขนิยายของนักเขียน B ระบบป้องกันอย่างไร?"]
//
// ฟังก์ชัน: requireWriterOwnsNovel
// หน้าที่: ตรวจสอบความเป็นเจ้าของ (Data Ownership Verification) ในระดับ Application Layer
//
// ขั้นตอนการทำงาน:
//  1. ดึง userID จาก Context ของ JWT Token ที่ผ่านการ Verify แล้ว (ไม่ใช้ค่าที่ส่งมาใน Body เพื่อกันการปลอมแปลง)
//  2. ค้นหาข้อมูลนักเขียน (Writer Profile) จากฐานข้อมูลด้วย userID นั้น เพื่อหา WriterID
//  3. ดึงข้อมูลนิยายเป้าหมาย (novelID) ที่ต้องการแก้ไขขึ้นมาดูว่าใครเป็น AuthorID (เจ้าของ)
//  4. เปรียบเทียบ: ถ้า novel.AuthorID != writer.WriterID
//     -> คืนค่า errOwnershipForbidden (HTTP 403 Forbidden) ไม่อนุญาตให้แก้ไขผลงานของคนอื่นเด็ดขาด!
//
// =========================================================================================
func requireWriterOwnsNovel(ctx context.Context, writerService service.WriterService, novelService service.NovelService, novelID int) error {
	// 1. ดึง ID ผู้ใช้จาก JWT Token ใน Context
	userID, ok := middleware.GetUserIDFromContext(ctx)
	if !ok || userID == 0 {
		return errOwnershipUnauthorized
	}

	// 2. ค้นหาโปรไฟล์นักเขียนของ User คนนี้
	writer, err := writerService.GetWriterByUserID(int(userID))
	if err != nil || writer == nil {
		return errOwnershipForbidden
	}

	// 3. ดึงข้อมูลนิยายขึ้นมาตรวจสอบ
	novelDetail, err := novelService.GetNovelDetail(novelID)
	if err != nil {
		return fmt.Errorf("load novel ownership: %w", err)
	}
	novel, ok := novelDetail.(*models.Novel)
	if !ok || novel == nil {
		return errors.New("failed to load novel details")
	}

	// 4. เช็คว่าผู้เขียนนิยายเรื่องนี้ตรงกับนักเขียนที่กำลังยิง Request มาหรือไม่
	if novel.AuthorID != writer.WriterID {
		return errOwnershipForbidden // ปฏิเสธทันทีถ้าไม่ใช่เจ้าของนิยาย!
	}
	return nil
}

func writeOwnershipError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, errOwnershipUnauthorized):
		WriteError(w, http.StatusUnauthorized, "unauthorized")
	case errors.Is(err, errOwnershipForbidden):
		WriteError(w, http.StatusForbidden, "forbidden")
	default:
		return false
	}
	return true
}
