package handlers

import (
	"net/http"
	"novel-be/internal/service"
	"strconv"
	"strings"
)

// GET /novels/{id}/comments/count
func GetCommentCountByNovelHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := strings.TrimPrefix(stripAPIVersionPrefix(r.URL.Path), "/novels/")
		parts := strings.Split(path, "/")
		if len(parts) < 3 || parts[1] != "comments" || parts[2] != "count" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /novels/{id}/comments/count")
			return
		}

		novelIDStr := strings.TrimSpace(parts[0])
		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid novel_id", "novel_id must be a positive integer")
			return
		}

		count, err := socialService.GetCommentCountByNovelID(novelID)
		if err != nil {
			respondInternal(w, "failed to fetch comment count", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"count": count,
		})
	}
}

// GET /novels/{id}/comments
func GetCommentsByNovelHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := strings.TrimPrefix(stripAPIVersionPrefix(r.URL.Path), "/novels/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "comments" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /novels/{id}/comments")
			return
		}

		novelIDStr := strings.TrimSpace(parts[0])
		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid novel_id", "novel_id must be a positive integer")
			return
		}

		comments, err := socialService.GetCommentsByNovelID(novelID)
		if err != nil {
			respondInternal(w, "failed to fetch comments", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"comments": comments,
		})
	}
}

// GET /scenes/{id}/comments
func GetCommentsBySceneHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only GET is supported")
			return
		}

		path := strings.TrimPrefix(stripAPIVersionPrefix(r.URL.Path), "/scenes/")
		parts := strings.Split(path, "/")
		if len(parts) < 2 || parts[1] != "comments" {
			RespondWithError(w, http.StatusBadRequest, "invalid path format", "expected /scenes/{id}/comments")
			return
		}

		sceneIDStr := strings.TrimSpace(parts[0])
		sceneID, err := strconv.Atoi(sceneIDStr)
		if err != nil || sceneID <= 0 {
			RespondWithError(w, http.StatusBadRequest, "invalid scene_id", "scene_id must be a positive integer")
			return
		}

		comments, err := socialService.GetCommentsBySceneID(sceneID)
		if err != nil {
			respondInternal(w, "failed to fetch comments", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]interface{}{
			"comments": comments,
		})
	}
}
