package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func sceneSubRouter(scene service.SceneService, novel service.NovelService, writer service.WriterService, chapter service.ChapterService, social service.SocialService, notificationService service.NotificationService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/scenes/"), "/")
		switch {
		// 🔒 PUT /scenes/:id/position - อัปเดตพิกัด Node ใน Story Tree
		case r.Method == http.MethodPut && strings.HasSuffix(path, "/position"):
			middleware.RequireAuth(http.HandlerFunc(handlers.UpdateScenePositionHandler(scene, novel, writer))).ServeHTTP(w, r)
			return
		// 📖 GET /scenes/:id/comments - อ่านได้ทั่วไป
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/comments"):
			handlers.GetCommentsBySceneHandler(social)(w, r)
		// 📖 GET /scenes/:id - ตรวจ 3 ระดับ published ถ้าไม่ใช่เจ้าของ/admin
		case r.Method == http.MethodGet && isNumericIDPath(path):
			handlers.GetSceneHandler(scene, chapter, novel, writer)(w, r)
		// 🔒 PUT /scenes/:id - อัปเดตฉากนิยาย
		case r.Method == http.MethodPut && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.UpdateSceneHandler(scene, notificationService, chapter, novel, writer, audit))).ServeHTTP(w, r)
			return
		// 🔒 DELETE /scenes/:id - ลบฉากนิยาย
		case r.Method == http.MethodDelete && isNumericIDPath(path):
			middleware.RequireAuth(http.HandlerFunc(handlers.DeleteSceneHandler(scene, chapter, novel, writer, audit))).ServeHTTP(w, r)
			return
		default:
			http.NotFound(w, r)
		}
	}
}
