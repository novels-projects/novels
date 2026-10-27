package handlers

import (
	"net/http"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/service"
	"strconv"
	"strings"
)

// GET /writer/{id}
func GetWriterDetailHandler(writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := stripAPIVersionPrefix(r.URL.Path)
		prefix := "/writer/"
		if strings.HasPrefix(path, "/writers/") {
			prefix = "/writers/"
		}
		id, err := extractIDFromPath(r.URL.Path, prefix)
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "invalid writer id", err.Error())
			return
		}

		writer, err := writerService.GetWriterByID(id)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "writer not found", err.Error())
			return
		}

		RespondWithJSON(w, http.StatusOK, writer)
	}
}

func GetWriterBookshelfCountsHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := stripAPIVersionPrefix(r.URL.Path)
		path = strings.TrimPrefix(path, "/writer/")
		path = strings.TrimPrefix(path, "/writers/")
		parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
		if len(parts) != 2 || parts[1] != "bookshelf-counts" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /writer/{id}/bookshelf-counts")
			return
		}

		id, err := strconv.Atoi(parts[0])
		if err != nil || id <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid writer id", "writer id must be a positive integer")
			return
		}

		novels, err := socialService.GetBookshelfCountsByAuthorID(id)
		if err != nil {
			respondInternal(w, "failed to fetch bookshelf counts", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"author_id": id,
			"novels":    novels,
		})
	}
}

func GetWriterTotalViewsHandler(writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := stripAPIVersionPrefix(r.URL.Path)
		path = strings.TrimPrefix(path, "/writer/")
		path = strings.TrimPrefix(path, "/writers/")
		parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
		if len(parts) != 2 || parts[1] != "total-views" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /writer/{id}/total-views")
			return
		}

		id, err := strconv.Atoi(parts[0])
		if err != nil || id <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid writer id", "writer id must be a positive integer")
			return
		}

		writer, err := writerService.GetWriterByID(id)
		if err != nil {
			RespondWithError(w, http.StatusNotFound, "writer not found", err.Error())
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"author_id":        id,
			"total_view_count": writer.TotalViewCount,
		})
	}
}

// GET /me/novels - Get novels written by the logged-in user
func GetMyNovelsHandler(novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			RespondWithError(w, http.StatusUnauthorized, "unauthorized", "user_id not found in context")
			return
		}

		writer, err := writerService.GetWriterByUserID(int(userID))
		if err != nil || writer == nil {
			RespondWithError(w, http.StatusForbidden, "forbidden", "คุณยังไม่ใช่นักเขียนที่ได้รับอนุมัติ")
			return
		}

		authorID := writer.WriterID

		novels, err := novelService.GetNovelsByAuthorID(authorID)
		if err != nil {
			respondInternal(w, "failed to fetch novels", err)
			return
		}

		if novels == nil {
			novels = []models.Novel{}
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"author_id": authorID,
			"novels":    novels,
		})
	}
}
