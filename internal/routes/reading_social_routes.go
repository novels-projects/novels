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
	progressHandler := middleware.RequestLogger(middleware.RequireAdminReadOnly(handlers.ProgressHandler(reading, novel, writer, scene, chapter)))
	mux.Handle("/progress", progressHandler)
	mux.Handle("/api/v1/reading/progress", progressHandler)

	historyHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handlers.GetReadingHistoryHandler(reading)(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			handlers.DeleteReadingHistoryBulkHandler(reading)(w, r)
			return
		}
		http.NotFound(w, r)
	})))
	mux.Handle("/history", historyHandler)
	mux.Handle("/api/v1/reading/histories", historyHandler)

	historySubHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.DeleteReadingHistoryByNovelHandler(reading)(w, r)
			return
		}
		http.NotFound(w, r)
	})))
	mux.Handle("/history/", historySubHandler)
	mux.Handle("/api/v1/reading/histories/", historySubHandler)

	choiceHistoryHandler := middleware.RequestLogger(middleware.RequireAuth(handlers.RecordChoiceHistoryHandler(reading, scene, novel, writer, chapter)))
	mux.Handle("/choice-history", choiceHistoryHandler)
	mux.Handle("/api/v1/reading/choice-histories", choiceHistoryHandler)

	userEndingsHandler := middleware.RequestLogger(middleware.RequireAuth(handlers.RecordUserEndingHandler(reading, scene, novel, writer)))
	mux.Handle("/user-endings", userEndingsHandler)
	mux.Handle("/api/v1/reading/user-endings", userEndingsHandler)

	likesHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			middleware.RequireAdminReadOnly(handlers.RemoveLikeHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		middleware.RequireAdminReadOnly(handlers.AddLikeHandler(social, notificationService)).ServeHTTP(w, r)
	}))
	mux.Handle("/likes", likesHandler)
	mux.Handle("/api/v1/likes", likesHandler)

	bookshelvesHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	}))
	mux.Handle("/bookshelves", bookshelvesHandler)
	mux.Handle("/api/v1/bookshelves", bookshelvesHandler)

	commentsHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			middleware.RequireNotAdmin(handlers.RemoveCommentHandler(social)).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodPost {
			middleware.RequireNotAdmin(handlers.AddCommentHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	mux.Handle("/comments", commentsHandler)
	mux.Handle("/api/v1/comments", commentsHandler)

	followsHandler := middleware.RequestLogger(middleware.RequireAdminReadOnly(handlers.AddFollowHandler(social, notificationService)))
	mux.Handle("/follows", followsHandler)
	mux.Handle("/api/v1/follows", followsHandler)

	followingWritersHandler := middleware.RequestLogger(middleware.RequireAuth(handlers.GetFollowingWritersHandler(social)))
	mux.Handle("/api/users/following-writers", followingWritersHandler)
	mux.Handle("/api/me/following-writers", followingWritersHandler)
	mux.Handle("/api/v1/users/me/following-writers", followingWritersHandler)

	writerFollowRouter := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/follow") {
			middleware.RequireNotAdmin(handlers.FollowWriterHandler(social, notificationService)).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/unfollow") {
			middleware.RequireNotAdmin(handlers.UnfollowWriterHandler(social)).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})
	mux.Handle("/api/writers/", middleware.RequestLogger(writerFollowRouter))

	writerDetailsRouter := http.HandlerFunc(writerSubRouter(writer, social))
	writerSubHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && (strings.HasSuffix(r.URL.Path, "/follow") || strings.HasSuffix(r.URL.Path, "/unfollow")) {
			writerFollowRouter.ServeHTTP(w, r)
			return
		}
		writerDetailsRouter.ServeHTTP(w, r)
	}))
	mux.Handle("/api/v1/writers/", writerSubHandler)
	writerDetailsHandler := middleware.RequestLogger(writerDetailsRouter)
	mux.Handle("/writer/", writerDetailsHandler)
	mux.Handle("/writers/", writerDetailsHandler)

}
