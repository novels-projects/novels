package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"strings"
)

func registerNotificationRoutes(mux *http.ServeMux, notificationHandler *handlers.NotificationHandler) {
	notificationRoutes := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		prefix := "/api/notifications"
		if strings.HasPrefix(r.URL.Path, "/notifications") {
			prefix = "/notifications"
		}

		path := strings.TrimPrefix(r.URL.Path, prefix+"/")
		switch {
		case r.URL.Path == prefix && r.Method == http.MethodGet:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.List)).ServeHTTP(w, r)
		case r.URL.Path == prefix && r.Method == http.MethodPost:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.CreateFromPayload)).ServeHTTP(w, r)
		case r.URL.Path == prefix && r.Method == http.MethodDelete:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.DeleteAll)).ServeHTTP(w, r)
		case path == "unread-count" && r.Method == http.MethodGet:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.UnreadCount)).ServeHTTP(w, r)
		case path == "read-all" && r.Method == http.MethodPatch:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.MarkAllRead)).ServeHTTP(w, r)
		case strings.HasSuffix(path, "/read") && r.Method == http.MethodPatch:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.MarkRead)).ServeHTTP(w, r)
		case strings.HasSuffix(path, "/delete") && r.Method == http.MethodDelete:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.Delete)).ServeHTTP(w, r)
		case r.Method == http.MethodDelete:
			middleware.RequireAuth(http.HandlerFunc(notificationHandler.Delete)).ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	mux.Handle("/notifications/stream", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(notificationHandler.Stream))))
	mux.Handle("/api/notifications/stream", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(notificationHandler.Stream))))
	mux.Handle("/notifications", middleware.RequestLogger(notificationRoutes))
	mux.Handle("/notifications/", middleware.RequestLogger(notificationRoutes))
	mux.Handle("/api/notifications", middleware.RequestLogger(notificationRoutes))
	mux.Handle("/api/notifications/", middleware.RequestLogger(notificationRoutes))

}
