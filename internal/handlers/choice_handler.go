package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"novel-be/internal/models"
	"novel-be/internal/service"
)

// writeChoiceServiceError map business error ของ choice เป็น HTTP status ที่เหมาะสม
// error ที่ไม่ใช่ business error (internal/DB) จะถูกตอบเป็นข้อความ generic แทน
func writeChoiceServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidChoiceLabel),
		errors.Is(err, service.ErrChoiceFromSceneMissing),
		errors.Is(err, service.ErrChoiceToSceneMissing),
		errors.Is(err, service.ErrChoiceCrossNovel),
		errors.Is(err, service.ErrChoiceSelfLoop),
		errors.Is(err, service.ErrChoiceFromEnding),
		errors.Is(err, service.ErrChoiceToStart),
		errors.Is(err, service.ErrChoiceReverse),
		errors.Is(err, service.ErrChoiceCycle),
		errors.Is(err, service.ErrChoiceWrongOrigin),
		errors.Is(err, service.ErrChoiceForeignToScene):
		WriteError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrChoiceNotFound):
		WriteError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrChoiceDuplicate):
		WriteError(w, http.StatusConflict, err.Error())
	default:
		writeInternalError(w, err)
	}
}

// =========================================================================================
// [อาจารย์ถาม: "เมื่อนักเขียนลากสาย Choice บนหน้าเว็บ (React Flow) API ทำงานอย่างไร?"]
//
// Endpoint: POST /choices
// หน้าที่: รับคำขอสร้างตัวเลือกเชื่อมฉาก (from_scene -> to_scene)
//
// ลำดับขั้นตอนการทำงานใน Handler:
// 1. ตรวจสอบ HTTP Method ต้องเป็น POST เท่านั้น
// 2. แกะข้อมูล JSON Body เป็น CreateChoiceRequest struct
// 3. เรียก req.Validate() ตรวจสอบความถูกต้องเบื้องต้น (เช่น ข้อความ Label ว่างไหม, ID > 0 ไหม)
// 4. ตรวจสอบสิทธิ์ความเป็นเจ้าของ (Ownership): ยืนยันว่านักเขียนเป็นเจ้าของนิยายเรื่องนี้จริง
// 5. ส่งข้อมูลต่อไปให้ sceneService.CreateChoice เพื่อตรวจสอบกราฟ DAG (ดักลูป) และบันทึกลง Database
// =========================================================================================
func CreateChoiceHandler(sceneService service.SceneService, chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		var req CreateChoiceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		fromScene, err := sceneService.GetScene(req.FromSceneID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "source scene not found")
			return
		}
		chapter, err := chapterService.GetChapterByID(fromScene.ChapterID)
		if err != nil || chapter == nil || chapter.NovelID != fromScene.NovelID {
			WriteError(w, http.StatusNotFound, "source scene not found")
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, fromScene.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		choiceID, err := sceneService.CreateChoice(models.Choice{
			FromSceneID: req.FromSceneID,
			ToSceneID:   req.ToSceneID,
			Label:       req.Label,
		})
		if err != nil {
			writeChoiceServiceError(w, err)
			return
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "CREATE_CHOICE", TargetType: "choice", TargetID: int64Pointer(choiceID), Status: "SUCCESS", Metadata: map[string]interface{}{"from_scene_id": req.FromSceneID, "to_scene_id": req.ToSceneID}})

		WriteJSON(w, http.StatusCreated, map[string]any{"message": "choice created", "choice_id": choiceID})
	}
}

func UpdateChoiceHandler(sceneService service.SceneService, chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		choiceID, err := extractIDFromPath(r.URL.Path, "/choices/")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid choice id")
			return
		}
		existingChoice, err := sceneService.GetChoiceByID(choiceID)
		if err != nil || existingChoice == nil {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		fromScene, err := sceneService.GetScene(existingChoice.FromSceneID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		chapter, err := chapterService.GetChapterByID(fromScene.ChapterID)
		if err != nil || chapter == nil || chapter.NovelID != fromScene.NovelID {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, fromScene.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		var req UpdateChoiceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		choice := models.Choice{
			ChoiceID:  choiceID,
			ToSceneID: req.ToSceneID,
			Label:     req.Label,
		}

		if err := sceneService.UpdateChoice(choice); err != nil {
			writeChoiceServiceError(w, err)
			return
		}
		choiceUpdMeta := map[string]interface{}{"from_scene_id": existingChoice.FromSceneID}
		// เก็บ diff เฉพาะ field ที่เปลี่ยนจริง (label/to_scene_id)
		if existingChoice.Label != req.Label {
			choiceUpdMeta["old_label"] = existingChoice.Label
			choiceUpdMeta["new_label"] = req.Label
		}
		if existingChoice.ToSceneID != req.ToSceneID {
			choiceUpdMeta["old_to_scene_id"] = existingChoice.ToSceneID
			choiceUpdMeta["new_to_scene_id"] = req.ToSceneID
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "UPDATE_CHOICE", TargetType: "choice", TargetID: int64Pointer(choiceID), Status: "SUCCESS", Metadata: choiceUpdMeta})

		WriteJSON(w, http.StatusOK, map[string]any{"message": "choice updated"})
	}
}

func DeleteChoiceHandler(sceneService service.SceneService, chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		choiceID, err := extractIDFromPath(r.URL.Path, "/choices/")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid choice id")
			return
		}
		existingChoice, err := sceneService.GetChoiceByID(choiceID)
		if err != nil || existingChoice == nil {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		fromScene, err := sceneService.GetScene(existingChoice.FromSceneID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		chapter, err := chapterService.GetChapterByID(fromScene.ChapterID)
		if err != nil || chapter == nil || chapter.NovelID != fromScene.NovelID {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, fromScene.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		if err := sceneService.DeleteChoice(choiceID); err != nil {
			writeChoiceServiceError(w, err)
			return
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "DELETE_CHOICE", TargetType: "choice", TargetID: int64Pointer(choiceID), Status: "SUCCESS", Metadata: map[string]interface{}{"from_scene_id": existingChoice.FromSceneID, "to_scene_id": existingChoice.ToSceneID}})

		WriteJSON(w, http.StatusOK, map[string]any{"message": "choice deleted"})
	}
}
