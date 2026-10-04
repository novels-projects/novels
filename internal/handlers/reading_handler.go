package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

func CheckIsOwnerOrAdmin(r *http.Request, novelID int, novelService service.NovelService, writerService service.WriterService) bool {
	ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || ctxUserID == 0 {
		return false
	}

	if role, roleOk := middleware.GetRoleFromContext(r.Context()); roleOk && role == "admin" {
		return true
	}

	if novelService == nil || writerService == nil {
		return false
	}

	novelDetail, err := novelService.GetNovelDetail(novelID)
	if err != nil {
		return false
	}

	novelPtr, ok := novelDetail.(*models.Novel)
	if !ok || novelPtr == nil {
		return false
	}

	writer, err := writerService.GetWriterByUserID(int(ctxUserID))
	if err != nil || writer == nil {
		return false
	}

	return writer.WriterID == novelPtr.AuthorID
}

func IsPreviewMode(r *http.Request, novelID int, novelService service.NovelService, writerService service.WriterService) bool {
	if r.URL.Query().Get("preview") != "true" {
		return false
	}
	return CheckIsOwnerOrAdmin(r, novelID, novelService, writerService)
}

// StartReadingHandler หาฉากแรกสุดของนิยายเรื่องนั้น
func StartReadingHandler(sceneService service.SceneService, novelService service.NovelService, writerService service.WriterService, chapterService service.ChapterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// รับ id จาก path parameter เช่น /novels/{id}/start
		novelID, err := extractIDFromPath(r.URL.Path, "/novels/")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "ID นิยายไม่ถูกต้อง")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		isOwnerOrAdmin := CheckIsOwnerOrAdmin(r, novelID, novelService, writerService)

		if !isOwnerOrAdmin && !novelPtr.IsPublished {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		scene, err := sceneService.GetStartScene(novelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "ไม่พบจุดเริ่มต้นของนิยายเรื่องนี้")
			return
		}

		// ตรวจ chapter + scene status (reader ต้องเห็นเฉพาะที่ published ครบ 3 ระดับ)
		if !isOwnerOrAdmin {
			ch, chErr := chapterService.GetChapterByID(scene.ChapterID)
			if chErr != nil || ch == nil || ch.Status != "published" || scene.Status != "published" {
				WriteError(w, http.StatusNotFound, "ไม่พบจุดเริ่มต้นของนิยายเรื่องนี้")
				return
			}
		}

		WriteJSON(w, http.StatusOK, scene)
	}
}

func GetProgressHandler(readingService service.ReadingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || ctxUserID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		userID := int(ctxUserID)

		novelID, err := strconv.Atoi(r.URL.Query().Get("novel_id"))
		if err != nil || novelID == 0 {
			WriteError(w, http.StatusBadRequest, "novel_id is required")
			return
		}

		progress, err := readingService.GetProgress(userID, novelID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		if progress == nil {
			WriteJSON(w, http.StatusOK, map[string]any{"message": "no progress found", "progress": nil})
			return
		}

		WriteJSON(w, http.StatusOK, progress)
	}
}

func GetReadingHistoryHandler(readingService service.ReadingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		novels, err := readingService.GetReadingHistory(int(userID))
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"history": novels})
	}
}

func DeleteReadingHistoryByNovelHandler(readingService service.ReadingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		novelID, err := extractIDFromPath(r.URL.Path, "/history/")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		deleted, err := readingService.DeleteReadingHistoryByNovel(int(userID), novelID)
		if err != nil {
			if errors.Is(err, repository.ErrReadingHistoryForbidden) {
				WriteError(w, http.StatusForbidden, "forbidden: this history does not belong to the current user")
				return
			}
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !deleted {
			WriteError(w, http.StatusNotFound, "reading history not found")
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"message": "reading history deleted"})
	}
}

func DeleteReadingHistoryBulkHandler(readingService service.ReadingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var payload struct {
			NovelIDs []int `json:"novelIds"`
		}
		if r.Body != nil {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
				WriteError(w, http.StatusBadRequest, "invalid request body")
				return
			}
		}

		count, err := readingService.DeleteReadingHistoryByUser(int(userID), payload.NovelIDs)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{
			"message":       "reading history deleted",
			"deleted_count": count,
		})
	}
}

func ProgressHandler(readingService service.ReadingService, novelService service.NovelService, writerService service.WriterService, sceneService service.SceneService, chapterService service.ChapterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodOptions:
			w.WriteHeader(http.StatusNoContent)
		case http.MethodGet:
			GetProgressHandler(readingService)(w, r)
		case http.MethodPost:
			SaveProgressHandler(readingService, novelService, writerService, sceneService, chapterService)(w, r)
		case http.MethodDelete:
			ResetProgressHandler(readingService)(w, r)
		default:
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	}
}

func ResetProgressHandler(readingService service.ReadingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || ctxUserID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		userID := int(ctxUserID)

		novelID, err := strconv.Atoi(r.URL.Query().Get("novel_id"))
		if err != nil || novelID == 0 {
			WriteError(w, http.StatusBadRequest, "novel_id is required")
			return
		}

		if err := readingService.ResetProgress(userID, novelID); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusOK, map[string]string{"message": "progress reset"})
	}
}

func RestartStoryHandler(sceneService service.SceneService, readingService service.ReadingService, novelService service.NovelService, chapterService service.ChapterService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		novelID, err := extractIDFromPath(r.URL.Path, "/novels/")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}
		novelPtr, nOk := novelDetail.(*models.Novel)
		if !nOk || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		isOwnerOrAdmin := CheckIsOwnerOrAdmin(r, novelID, novelService, writerService)
		isPreview := IsPreviewMode(r, novelID, novelService, writerService)

		if !isOwnerOrAdmin && !novelPtr.IsPublished {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		startScene, err := sceneService.GetStartScene(novelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "ไม่พบจุดเริ่มต้นของนิยายเรื่องนี้")
			return
		}

		// ตรวจ chapter + scene status (reader ต้องเห็นเฉพาะที่ published ครบ 3 ระดับ)
		if !isOwnerOrAdmin {
			ch, chErr := chapterService.GetChapterByID(startScene.ChapterID)
			if chErr != nil || ch == nil || ch.Status != "published" || startScene.Status != "published" {
				WriteError(w, http.StatusNotFound, "ไม่พบจุดเริ่มต้นของนิยายเรื่องนี้")
				return
			}
		}

		if isPreview {
			WriteJSON(w, http.StatusOK, dto.RestartStoryResponseDTO{
				NovelID:      novelID,
				StartSceneID: startScene.SceneID,
			})
			return
		}

		if err := readingService.ResetProgress(int(userID), novelID); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		if err := readingService.SaveProgress(models.ReadingProgress{
			UserID:         int(userID),
			NovelID:        novelID,
			CurrentSceneID: startScene.SceneID,
		}); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusOK, dto.RestartStoryResponseDTO{
			NovelID:      novelID,
			StartSceneID: startScene.SceneID,
		})
	}
}

func SaveProgressHandler(readingService service.ReadingService, novelService service.NovelService, writerService service.WriterService, sceneService service.SceneService, chapterService service.ChapterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req SaveProgressRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		isPreview := IsPreviewMode(r, req.NovelID, novelService, writerService)
		if isPreview {
			WriteJSON(w, http.StatusCreated, map[string]string{"message": "progress saved"})
			return
		}

		isOwnerOrAdmin := CheckIsOwnerOrAdmin(r, req.NovelID, novelService, writerService)
		if !isOwnerOrAdmin {
			if sceneService == nil || novelService == nil || chapterService == nil {
				WriteError(w, http.StatusInternalServerError, "required services not initialized")
				return
			}

			scene, err := sceneService.GetScene(req.CurrentSceneID)
			if err != nil || scene.NovelID != req.NovelID {
				WriteError(w, http.StatusNotFound, "scene not found")
				return
			}

			chapter, err := chapterService.GetChapterByID(scene.ChapterID)
			if err != nil || chapter == nil || chapter.NovelID != req.NovelID {
				WriteError(w, http.StatusNotFound, "scene not found")
				return
			}

			novelDetail, err := novelService.GetNovelDetail(req.NovelID)
			if err != nil {
				WriteError(w, http.StatusNotFound, "scene not found")
				return
			}

			novelPtr, ok := novelDetail.(*models.Novel)
			if !ok || novelPtr == nil {
				WriteError(w, http.StatusInternalServerError, "failed to load novel details")
				return
			}

			if !novelPtr.IsPublished || chapter.Status != "published" || scene.Status != "published" {
				WriteError(w, http.StatusNotFound, "scene not found")
				return
			}
		}

		effectiveUserID := req.UserID
		if ctxUserID, ok := middleware.GetUserIDFromContext(r.Context()); ok && ctxUserID > 0 {
			effectiveUserID = int(ctxUserID)
		}

		if err := readingService.SaveProgress(models.ReadingProgress{
			UserID:         effectiveUserID,
			NovelID:        req.NovelID,
			CurrentSceneID: req.CurrentSceneID,
		}); err != nil {
			if errors.Is(err, repository.ErrReadingProgressTransitionInvalid) {
				WriteError(w, http.StatusForbidden, "scene must be reached through a valid choice")
				return
			}
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "progress saved"})
	}
}

func RecordChoiceHistoryHandler(readingService service.ReadingService, sceneService service.SceneService, novelService service.NovelService, writerService service.WriterService, chapterService service.ChapterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RecordChoiceHistoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		if sceneService == nil || novelService == nil || chapterService == nil {
			WriteError(w, http.StatusInternalServerError, "required services not initialized")
			return
		}

		choice, err := sceneService.GetChoiceByID(req.ChoiceID)
		if err != nil || choice == nil {
			WriteError(w, http.StatusNotFound, "choice not found")
			return
		}

		toScene, err := sceneService.GetScene(choice.ToSceneID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}

		chapter, err := chapterService.GetChapterByID(toScene.ChapterID)
		if err != nil || chapter == nil {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(toScene.NovelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		isPreview := IsPreviewMode(r, toScene.NovelID, novelService, writerService)
		if isPreview {
			WriteJSON(w, http.StatusCreated, map[string]string{"message": "choice history recorded"})
			return
		}

		if !novelPtr.IsPublished || chapter.Status != "published" || toScene.Status != "published" {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}

		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || ctxUserID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		fromScene, err := sceneService.GetScene(choice.FromSceneID)
		if err != nil || fromScene.NovelID != toScene.NovelID || fromScene.SceneID == toScene.SceneID || fromScene.Type == "ending" || toScene.Type == "start" {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}
		fromChapter, err := chapterService.GetChapterByID(fromScene.ChapterID)
		if err != nil || fromChapter == nil || fromChapter.NovelID != toScene.NovelID {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}
		if fromScene.Status != "published" || fromChapter.Status != "published" {
			WriteError(w, http.StatusNotFound, "scene not found")
			return
		}

		progress, err := readingService.GetProgress(int(ctxUserID), toScene.NovelID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if progress != nil {
			if progress.CurrentSceneID != choice.FromSceneID {
				WriteError(w, http.StatusForbidden, "choice does not start at the current scene")
				return
			}
		} else {
			startScene, err := sceneService.GetStartScene(toScene.NovelID)
			if err != nil || startScene.SceneID != choice.FromSceneID {
				WriteError(w, http.StatusForbidden, "choice does not start at the current scene")
				return
			}
		}

		if err := readingService.RecordChoiceHistory(models.ChoiceHistory{UserID: int(ctxUserID), ChoiceID: req.ChoiceID}); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "choice history recorded"})
	}
}

func RecordUserEndingHandler(readingService service.ReadingService, sceneService service.SceneService, novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type EndingRequest struct {
			UserID  int `json:"user_id"`
			NovelID int `json:"novel_id"`
			SceneID int `json:"scene_id"`
		}

		var req EndingRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.NovelID == 0 || req.SceneID == 0 {
			WriteError(w, http.StatusBadRequest, "novel_id and scene_id are required")
			return
		}

		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || ctxUserID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		isPreview := IsPreviewMode(r, req.NovelID, novelService, writerService)
		if isPreview {
			WriteJSON(w, http.StatusCreated, map[string]string{"message": "ending recorded successfully"})
			return
		}

		ending, err := sceneService.GetScene(req.SceneID)
		if err != nil || ending.NovelID != req.NovelID || ending.Type != "ending" || ending.Status != "published" {
			WriteError(w, http.StatusNotFound, "published ending not found")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(req.NovelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}
		novel, ok := novelDetail.(*models.Novel)
		if !ok || novel == nil || !novel.IsPublished {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		progress, err := readingService.GetProgress(int(ctxUserID), req.NovelID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if progress == nil || progress.CurrentSceneID != req.SceneID {
			WriteError(w, http.StatusForbidden, "ending has not been reached")
			return
		}

		endings, err := sceneService.GetEndingsByNovelID(req.NovelID, int(ctxUserID))
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		isUnlocked := false
		for _, unlockedEnding := range endings {
			if unlockedEnding.SceneID == req.SceneID && unlockedEnding.IsUnlocked {
				isUnlocked = true
				break
			}
		}
		if !isUnlocked {
			WriteError(w, http.StatusForbidden, "ending has not been reached")
			return
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "ending recorded successfully"})
	}
}
