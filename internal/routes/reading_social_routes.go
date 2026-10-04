package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func registerReadingSocialRoutes(mux *http.ServeMux, reading service.ReadingService, social service.SocialService, notificationService service.NotificationService, scene service.SceneService, novel service.NovelService, writer service.WriterService, chapter service.ChapterService) {
	// 🟢 Reading Flow & Social (คุมพฤติกรรม)
	// ------------------------------------------
	mux.Handle("/progress", middleware.RequestLogger(middleware.RequireAdminReadOnly(handlers.ProgressHandler(reading, novel, writer, scene, chapter))))
	mux.Handle("/history", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handlers.GetReadingHistoryHandler(reading)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			handlers.DeleteReadingHistoryBulkHandler(reading)(w, r)
			return
		}
		http.NotFound(w, r)
	}))))
	mux.Handle("/history/", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.DeleteReadingHistoryByNovelHandler(reading)(w, r)
			return
		}
		http.NotFound(w, r)
	}))))
	mux.Handle("/choice-history", middleware.RequestLogger(middleware.RequireAuth(handlers.RecordChoiceHistoryHandler(reading, scene, novel, writer, chapter))))
	mux.Handle("/user-endings", middleware.RequestLogger(middleware.RequireAuth(handlers.RecordUserEndingHandler(reading, scene, novel, writer))))
	mux.Handle("/likes", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			middleware.RequireAdminReadOnly(handlers.RemoveLikeHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		middleware.RequireAdminReadOnly(handlers.AddLikeHandler(social, notificationService)).ServeHTTP(w, r)
	})))
	mux.Handle("/bookshelves", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if r.URL.Query().Get("novel_id") != "" {
				handlers.GetBookshelfCountHandler(social)(w, r)
				return
			}
			handlers.GetBookshelfHandler(social)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			middleware.RequireNotAdmin(handlers.RemoveFromBookshelfHandler(social)).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodPost {
			middleware.RequireNotAdmin(handlers.AddToBookshelfHandler(social)).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})))
	mux.Handle("/comments", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			middleware.RequireNotAdmin(handlers.RemoveCommentHandler(social)).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodPost {
			middleware.RequireNotAdmin(handlers.AddCommentHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})))
	mux.Handle("/follows", middleware.RequestLogger(middleware.RequireAdminReadOnly(handlers.AddFollowHandler(social, notificationService))))
	mux.Handle("/api/users/following-writers", middleware.RequestLogger(middleware.RequireAuth(handlers.GetFollowingWritersHandler(social))))
	mux.Handle("/api/me/following-writers", middleware.RequestLogger(middleware.RequireAuth(handlers.GetFollowingWritersHandler(social))))
	mux.Handle("/api/writers/", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/follow") {
			middleware.RequireNotAdmin(handlers.FollowWriterHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/unfollow") {
			middleware.RequireNotAdmin(handlers.UnfollowWriterHandler(social)).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})))

	mux.Handle("/writer/", middleware.RequestLogger(http.HandlerFunc(writerSubRouter(writer, social))))

}
