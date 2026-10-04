package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func novelSubRouter(novel service.NovelService, scene service.SceneService, chapter service.ChapterService, social service.SocialService, writer service.WriterService, reading service.ReadingService, notificationService service.NotificationService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/novels/"), "/")

		switch {
		case r.Method == http.MethodPut && strings.HasSuffix(path, "/chapters/reorder"):
			middleware.RequireAuth(http.HandlerFunc(handlers.ReorderChaptersHandler(chapter, novel, writer))).ServeHTTP(w, r)
			return
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/chapters"):
			handlers.GetChaptersByNovelHandler(chapter, novel, writer)(w, r)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/comments/count"):
			handlers.GetCommentCountByNovelHandler(social)(w, r)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/comments"):
			handlers.GetCommentsByNovelHandler(social)(w, r)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/story-tree"):
			handlers.GetStoryTreeHandler(scene, novel, writer)(w, r)
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/start"):
			handlers.StartReadingHandler(scene, novel, writer, chapter)(w, r)
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/restart"):
			middleware.RequireAuth(http.HandlerFunc(handlers.RestartStoryHandler(scene, reading, novel, chapter, writer))).ServeHTTP(w, r)
		case r.Method == http.MethodPut && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.UpdateNovelHandler(novel, scene, writer, notificationService, audit))).ServeHTTP(w, r)
		case r.Method == http.MethodDelete && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.DeleteNovelHandler(novel, writer, audit))).ServeHTTP(w, r)
		case r.Method == http.MethodGet && isNumericIDPath(path):
			handlers.GetNovelDetailHandler(novel, scene, social, writer)(w, r)
		default:
			http.NotFound(w, r)
		}
	}
}
