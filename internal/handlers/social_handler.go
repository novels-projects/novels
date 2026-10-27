package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

func AddLikeHandler(socialService service.SocialService, notificationService service.NotificationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req LikeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		req.UserID = int(userID)
		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		if err := socialService.AddLike(models.Like{UserID: req.UserID, NovelID: req.NovelID}); err != nil {
			writeInternalError(w, err)
			return
		}

		if err := notificationService.NotifyLike(req.NovelID, req.UserID); err != nil {
			log.Printf("NotifyLike failed: %v", err)
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "like recorded"})
	}
}

func RemoveLikeHandler(socialService service.SocialService, notificationService service.NotificationService) http.HandlerFunc {
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

		novelIDStr := r.URL.Query().Get("novel_id")
		if novelIDStr == "" {
			WriteError(w, http.StatusBadRequest, "novel_id is required")
			return
		}

		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid novel_id")
			return
		}

		if err := socialService.RemoveLike(int(userID), novelID); err != nil {
			writeInternalError(w, err)
			return
		}

		if err := notificationService.DeleteLikeNotification(novelID, int(userID)); err != nil {
			log.Printf("DeleteLikeNotification failed: %v", err)
		}

		WriteJSON(w, http.StatusOK, map[string]string{"message": "like removed"})
	}
}

func AddToBookshelfHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req BookshelfRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		novelIDStr := r.URL.Query().Get("novel_id")
		if req.NovelID == 0 && novelIDStr != "" {
			novelID, err := strconv.Atoi(novelIDStr)
			if err == nil {
				req.NovelID = novelID
			}
		}

		req.UserID = int(userID)
		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		if err := socialService.AddToBookshelf(req.UserID, req.NovelID); err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "added to bookshelf"})
	}
}

func RemoveFromBookshelfHandler(socialService service.SocialService) http.HandlerFunc {
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

		novelIDStr := r.URL.Query().Get("novel_id")
		if novelIDStr == "" {
			var req BookshelfRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
				WriteError(w, http.StatusBadRequest, "invalid request body")
				return
			}
			novelIDStr = strconv.Itoa(req.NovelID)
		}

		if novelIDStr == "" {
			WriteError(w, http.StatusBadRequest, "novel_id is required")
			return
		}

		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid novel_id")
			return
		}

		if err := socialService.RemoveFromBookshelf(int(userID), novelID); err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, map[string]string{"message": "removed from bookshelf"})
	}
}

func GetBookshelfHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userIDStr := r.URL.Query().Get("user_id")
		if userIDStr == "" {
			if userID, ok := middleware.GetUserIDFromContext(r.Context()); ok && userID != 0 {
				userIDStr = strconv.Itoa(int(userID))
			}
		}

		if userIDStr == "" {
			WriteError(w, http.StatusBadRequest, "user_id is required")
			return
		}

		userID, err := strconv.Atoi(userIDStr)
		if err != nil || userID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid user_id")
			return
		}

		novels, err := socialService.GetBookshelfByUserID(userID)
		if err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"bookshelf": novels})
	}
}

func GetBookshelfCountHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		novelIDStr := r.URL.Query().Get("novel_id")
		if novelIDStr == "" {
			WriteError(w, http.StatusBadRequest, "novel_id is required")
			return
		}

		novelID, err := strconv.Atoi(novelIDStr)
		if err != nil || novelID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid novel_id")
			return
		}

		count, err := socialService.GetBookshelfCountByNovelID(novelID)
		if err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"novel_id": novelID, "bookshelf_count": count})
	}
}

func AddCommentHandler(socialService service.SocialService, notificationService service.NotificationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req CommentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		req.UserID = int(userID)
		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		commentID, err := socialService.AddComment(models.Comment{UserID: req.UserID, NovelID: req.NovelID, SceneID: req.SceneID, Content: req.Content})
		if err != nil {
			writeInternalError(w, err)
			return
		}

		if err := notificationService.NotifyComment(req.NovelID, req.UserID, req.Content); err != nil {
			log.Printf("NotifyComment failed: %v", err)
		}

		WriteJSON(w, http.StatusCreated, map[string]any{"message": "comment added", "comment_id": commentID})
	}
}

func RemoveCommentHandler(socialService service.SocialService) http.HandlerFunc {
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

		commentIDStr := r.URL.Query().Get("comment_id")
		if commentIDStr == "" {
			WriteError(w, http.StatusBadRequest, "comment_id is required")
			return
		}

		commentID, err := strconv.Atoi(commentIDStr)
		if err != nil || commentID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid comment_id")
			return
		}

		if err := socialService.RemoveComment(commentID, int(userID)); err != nil {
			if err == sql.ErrNoRows {
				WriteError(w, http.StatusNotFound, "comment not found or not owned by user")
				return
			}
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, map[string]string{"message": "comment deleted"})
	}
}

func AddFollowHandler(socialService service.SocialService, notificationService service.NotificationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req FollowRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		req.FollowerID = int(userID)
		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		log.Printf("AddFollowHandler: received follow request follower=%d following=%d", req.FollowerID, req.FollowingID)
		if err := socialService.AddFollow(models.Follow{FollowerID: req.FollowerID, FollowingID: req.FollowingID}); err != nil {
			if errors.Is(err, repository.ErrSelfFollow) {
				WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeInternalError(w, err)
			return
		}

		if err := notificationService.NotifyFollow(req.FollowingID, req.FollowerID); err != nil {
			log.Printf("NotifyFollow failed: %v", err)
		}

		WriteJSON(w, http.StatusCreated, map[string]string{"message": "follow recorded"})
	}
}

func FollowWriterHandler(socialService service.SocialService, notificationService service.NotificationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		writerID, err := extractIDFromPath(r.URL.Path, "/api/writers/")
		if err != nil {
			writerID, err = extractIDFromPath(r.URL.Path, "/writers/")
		}
		if err != nil || writerID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid writer_id")
			return
		}

		log.Printf("FollowWriterHandler: user=%d follows writer=%d", userID, writerID)
		if err := socialService.AddFollow(models.Follow{FollowerID: int(userID), FollowingID: writerID}); err != nil {
			if errors.Is(err, repository.ErrSelfFollow) {
				WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeInternalError(w, err)
			return
		}

		if err := notificationService.NotifyFollow(writerID, int(userID)); err != nil {
			log.Printf("NotifyFollow failed: %v", err)
		}

		WriteJSON(w, http.StatusCreated, map[string]any{"message": "follow recorded", "writer_id": writerID})
	}
}

func UnfollowWriterHandler(socialService service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		writerID, err := extractIDFromPath(r.URL.Path, "/api/writers/")
		if err != nil {
			writerID, err = extractIDFromPath(r.URL.Path, "/writers/")
		}
		if err != nil || writerID == 0 {
			WriteError(w, http.StatusBadRequest, "invalid writer_id")
			return
		}

		if err := socialService.RemoveFollow(int(userID), writerID); err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, map[string]any{"message": "follow removed", "writer_id": writerID})
	}
}

func GetFollowingWritersHandler(socialService service.SocialService) http.HandlerFunc {
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

		writers, err := socialService.GetFollowingWriters(int(userID))
		if err != nil {
			writeInternalError(w, err)
			return
		}

		WriteJSON(w, http.StatusOK, writers)
	}
}
