package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

func CreateChapterHandler(chapterService service.ChapterService, notificationService service.NotificationService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			RespondWithError3(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		var req CreateChapterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			RespondWithError3(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, req.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		chapterID, err := chapterService.CreateChapter(models.Chapter{
			NovelID: req.NovelID,
			Episode: req.Episode,
			Title:   req.Title,
			Status:  req.Status,
		})
		if err != nil {
			writeInternalError(w, err)
			return
		}

		if err := notificationService.NotifyNovelChapterPublished(req.NovelID, chapterID); err != nil {
			log.Printf("NotifyNovelChapterPublished failed: %v", err)
		}
		chMeta := map[string]interface{}{"novel_id": req.NovelID, "chapter_title": req.Title}
		if nov, err := novelService.GetNovelDetail(req.NovelID); err == nil && nov != nil {
			if n, ok := nov.(*models.Novel); ok && n != nil {
				chMeta["novel_title"] = n.Title
			}
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "CREATE_CHAPTER", TargetType: "chapter", TargetID: int64Pointer(chapterID), Status: "SUCCESS", Metadata: chMeta})

		RespondWithJSON(w, http.StatusCreated, map[string]any{"message": "chapter created", "chapter_id": chapterID})
	}
}

func UpdateChapterHandler(chapterService service.ChapterService, sceneService service.SceneService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			RespondWithError3(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		chapterID, err := extractIDFromPath(r.URL.Path, "/chapters/")
		if err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid chapter id")
			return
		}

		var req UpdateChapterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			RespondWithError3(w, http.StatusBadRequest, err.Error())
			return
		}

		chapter, err := chapterService.GetChapterByID(chapterID)
		if err != nil {
			writeInternalError(w, err)
			return
		}
		if chapter == nil {
			RespondWithError3(w, http.StatusNotFound, "chapter not found")
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, chapter.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		oldStatus := chapter.Status
		oldTitle := chapter.Title

		if strings.TrimSpace(req.Title) != "" {
			chapter.Title = req.Title
		}
		if strings.TrimSpace(req.Status) != "" {
			chapter.Status = req.Status
		}

		var validationResult *service.PublishValidationResult
		isPublishing := !strings.EqualFold(oldStatus, "published") && strings.EqualFold(chapter.Status, "published")
		if isPublishing {
			val := sceneService.ValidateNovelPublishability(chapter.NovelID)
			validationResult = &val
			if !val.CanPublish {
				RespondWithJSON(w, http.StatusBadRequest, map[string]any{
					"error":       "ไม่สามารถเผยแพร่ตอนได้เนื่องจากมีปัญหาโครงสร้างนิยาย",
					"can_publish": false,
					"issues":      val.Issues,
				})
				return
			}
		}

		if err := chapterService.UpdateChapter(*chapter); err != nil {
			writeInternalError(w, err)
			return
		}
		updChMeta := map[string]interface{}{"novel_id": chapter.NovelID, "chapter_title": chapter.Title}
		// เก็บ diff เฉพาะ field ที่เปลี่ยนจริง เหมือนแนวทางที่ UPDATE_NOVEL ใช้อยู่แล้ว
		if oldTitle != chapter.Title {
			updChMeta["old_title"] = oldTitle
			updChMeta["new_title"] = chapter.Title
		}
		if oldStatus != chapter.Status {
			updChMeta["old_status"] = oldStatus
			updChMeta["new_status"] = chapter.Status
		}
		if nov, err := novelService.GetNovelDetail(chapter.NovelID); err == nil && nov != nil {
			if n, ok := nov.(*models.Novel); ok && n != nil {
				updChMeta["novel_title"] = n.Title
			}
		}
		chapterAction := "UPDATE_CHAPTER"
		if strings.EqualFold(oldStatus, "draft") && strings.EqualFold(chapter.Status, "published") {
			chapterAction = "PUBLISH_CHAPTER"
		} else if strings.EqualFold(oldStatus, "published") && strings.EqualFold(chapter.Status, "draft") {
			chapterAction = "UNPUBLISH_CHAPTER"
		}
		recordAudit(r, auditService, service.AuditEvent{Action: chapterAction, TargetType: "chapter", TargetID: int64Pointer(chapterID), Status: "SUCCESS", Metadata: updChMeta})

		responsePayload := map[string]any{
			"message": "chapter updated",
		}
		if validationResult != nil && len(validationResult.Issues) > 0 {
			responsePayload["issues"] = validationResult.Issues
		}

		RespondWithJSON(w, http.StatusOK, responsePayload)
	}
}

func DeleteChapterHandler(chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			RespondWithError3(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		chapterID, err := extractIDFromPath(r.URL.Path, "/chapters/")
		if err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid chapter id")
			return
		}
		chapter, err := chapterService.GetChapterByID(chapterID)
		if err != nil {
			writeInternalError(w, err)
			return
		}
		if chapter == nil {
			RespondWithError3(w, http.StatusNotFound, "chapter not found")
			return
		}
		if err := requireWriterOwnsNovel(r.Context(), writerService, novelService, chapter.NovelID); err != nil {
			if writeOwnershipError(w, err) {
				return
			}
			writeInternalError(w, err)
			return
		}

		if err := chapterService.DeleteChapter(chapterID); err != nil {
			if errors.Is(err, repository.ErrChapterHasStartScene) || errors.Is(err, repository.ErrChapterHasIncomingChoices) {
				RespondWithError3(w, http.StatusConflict, err.Error())
				return
			}
			writeInternalError(w, err)
			return
		}
		delChMeta := map[string]interface{}{"novel_id": chapter.NovelID, "chapter_title": chapter.Title}
		if nov, err := novelService.GetNovelDetail(chapter.NovelID); err == nil && nov != nil {
			if n, ok := nov.(*models.Novel); ok && n != nil {
				delChMeta["novel_title"] = n.Title
			}
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "DELETE_CHAPTER", TargetType: "chapter", TargetID: int64Pointer(chapterID), Status: "SUCCESS", Metadata: delChMeta})

		RespondWithJSON(w, http.StatusOK, map[string]any{"message": "chapter deleted"})
	}
}

func ReorderChaptersHandler(chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			RespondWithError3(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		novelID, err := extractIDFromPath(r.URL.Path, "/novels/")
		if err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid novel id")
			return
		}
		if !CheckIsOwnerOrAdmin(r, novelID, novelService, writerService) {
			RespondWithError3(w, http.StatusForbidden, "forbidden: you do not own this novel")
			return
		}

		var payload struct {
			Order []int `json:"order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			RespondWithError3(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if len(payload.Order) == 0 {
			RespondWithError3(w, http.StatusBadRequest, "order empty")
			return
		}

		seen := make(map[int]struct{}, len(payload.Order))
		for _, chapterID := range payload.Order {
			if chapterID <= 0 {
				RespondWithError3(w, http.StatusBadRequest, "invalid chapter id")
				return
			}
			if _, exists := seen[chapterID]; exists {
				RespondWithError3(w, http.StatusBadRequest, "duplicate chapter id")
				return
			}
			seen[chapterID] = struct{}{}

			chapter, err := chapterService.GetChapterByID(chapterID)
			if err != nil || chapter == nil {
				RespondWithError3(w, http.StatusNotFound, "chapter not found")
				return
			}
			if chapter.NovelID != novelID {
				RespondWithError3(w, http.StatusBadRequest, "chapter does not belong to novel")
				return
			}
		}

		if err := chapterService.ReorderChapters(payload.Order); err != nil {
			writeInternalError(w, err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]any{"message": "chapters reordered"})
	}
}
