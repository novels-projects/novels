package handlers

import (
	"net/http"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/service"
	"strconv"
	"strings"
)

// GET /novels/{id}/chapters
func GetChaptersByNovelHandler(chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/novels/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "chapters" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /novels/{id}/chapters")
			return
		}

		novelIDStr := strings.TrimSpace(parts[0])
		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid novel_id", err.Error())
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "novel not found", "novel not found")
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			RespondWithError(w, http.StatusInternalServerError, "failed to load novel details", "failed to load novel details")
			return
		}

		isOwnerOrAdmin := false
		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if ok && ctxUserID != 0 {
			if role, roleOk := middleware.GetRoleFromContext(r.Context()); roleOk && role == "admin" {
				isOwnerOrAdmin = true
			} else if writerService != nil {
				writer, wErr := writerService.GetWriterByUserID(int(ctxUserID))
				if wErr == nil && writer != nil && writer.WriterID == novelPtr.AuthorID {
					isOwnerOrAdmin = true
				}
			}
		}

		if !isOwnerOrAdmin && !novelPtr.IsPublished {
			RespondWithError(w, http.StatusNotFound, "novel not found", "novel not found")
			return
		}

		chapters, err := chapterService.GetChaptersByNovelID(novelID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "failed to fetch chapters", err.Error())
			return
		}

		if !isOwnerOrAdmin {
			filtered := make([]models.Chapter, 0)
			for _, ch := range chapters {
				if ch.Status == "published" {
					filtered = append(filtered, ch)
				}
			}
			chapters = filtered
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"novel_id": novelID,
			"chapters": chapters,
		})
	}
}

// GET /chapters/{id}/scenes
func GetScenesByChapterHandler(sceneService service.SceneService, chapterService service.ChapterService, novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/chapters/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "scenes" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /chapters/{id}/scenes")
			return
		}

		chapterIDStr := strings.TrimSpace(parts[0])
		chapterID, err := strconv.Atoi(chapterIDStr)
		if err != nil || chapterID <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid chapter_id", err.Error())
			return
		}

		chapter, err := chapterService.GetChapterByID(chapterID)
		if err != nil || chapter == nil {
			RespondWithError(w, http.StatusNotFound, "chapter not found", "chapter not found")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(chapter.NovelID)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "novel not found", "novel not found")
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			RespondWithError(w, http.StatusInternalServerError, "failed to load novel details", "failed to load novel details")
			return
		}

		isOwnerOrAdmin := false
		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if ok && ctxUserID != 0 {
			if role, roleOk := middleware.GetRoleFromContext(r.Context()); roleOk && role == "admin" {
				isOwnerOrAdmin = true
			} else if writerService != nil {
				writer, wErr := writerService.GetWriterByUserID(int(ctxUserID))
				if wErr == nil && writer != nil && writer.WriterID == novelPtr.AuthorID {
					isOwnerOrAdmin = true
				}
			}
		}

		if !isOwnerOrAdmin {
			if !novelPtr.IsPublished || chapter.Status != "published" {
				RespondWithError(w, http.StatusNotFound, "chapter not found", "chapter not found")
				return
			}
		}

		scenes, err := sceneService.GetScenesByChapterID(chapterID)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "failed to fetch scenes", err.Error())
			return
		}

		if !isOwnerOrAdmin {
			filtered := make([]models.Scene, 0)
			for _, sc := range scenes {
				if sc.Status == "published" {
					filtered = append(filtered, sc)
				}
			}
			scenes = filtered
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"chapter_id": chapterID,
			"scenes":     scenes,
		})
	}
}
