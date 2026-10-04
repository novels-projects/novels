package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func chapterSubRouter(scene service.SceneService, chapter service.ChapterService, novel service.NovelService, writer service.WriterService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/chapters/"), "/")
		switch {
		// 📖 GET /chapters/:id/scenes - อ่านได้ทั่วไป
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/scenes"):
			handlers.GetScenesByChapterHandler(scene, chapter, novel, writer)(w, r)
		// 🔒 PUT /chapters/:id - อัปเดตสถานะ/ชื่อบท
		case r.Method == http.MethodPut && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.UpdateChapterHandler(chapter, scene, novel, writer, audit))).ServeHTTP(w, r)
		// 🔒 DELETE /chapters/:id - ลบตอน พร้อม RequireAuth
		case r.Method == http.MethodDelete && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.DeleteChapterHandler(chapter, novel, writer, audit))).ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	}
}
