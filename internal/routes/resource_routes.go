package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
)

func registerResourceRoutes(mux *http.ServeMux, category service.CategoryService, novel service.NovelService, scene service.SceneService, chapter service.ChapterService, social service.SocialService, writer service.WriterService, reading service.ReadingService, notificationService service.NotificationService, audit service.AuditService) {
	// ------------------------------------------
	categoriesHandler := middleware.RequestLogger(handlers.GetAllCategoriesHandler(category))
	mux.Handle("/categories", categoriesHandler)
	mux.Handle("/api/v1/categories", categoriesHandler)

	novelSubHandler := middleware.RequestLogger(middleware.OptionalAuth(http.HandlerFunc(novelSubRouter(novel, scene, chapter, social, writer, reading, notificationService, audit))))
	mux.Handle("/novels/", novelSubHandler)
	mux.Handle("/api/v1/novels/", novelSubHandler)

	// 🔒 POST /chapters ต้องมีการยืนยันตัวตนผู้ใช้ (JWT Token)
	chaptersHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.URL.Path == "/chapters" || r.URL.Path == "/api/v1/chapters") && r.Method == http.MethodPost {
			// ครอบด้วย RequireAuth เพื่อตรวจสอบ Token และถอดสิทธิ์ผู้ใช้
			middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				handlers.CreateChapterHandler(chapter, notificationService, novel, writer, audit)(w, r)
			})).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	mux.Handle("/chapters", chaptersHandler)
	mux.Handle("/api/v1/chapters", chaptersHandler)

	// 📖 GET /chapters/:id/scenes เปิดอ่านได้ทั่วไป (แต่ใช้ OptionalAuth เผื่อมี Token ของผู้ใช้/นักเขียน)
	chapterSubHandler := middleware.RequestLogger(middleware.OptionalAuth(http.HandlerFunc(chapterSubRouter(scene, chapter, novel, writer, audit))))
	mux.Handle("/chapters/", chapterSubHandler)
	mux.Handle("/api/v1/chapters/", chapterSubHandler)

	// 🔒 POST /scenes ต้องมีการยืนยันตัวตนผู้ใช้ (JWT Token)
	scenesHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.URL.Path == "/scenes" || r.URL.Path == "/api/v1/scenes") && r.Method == http.MethodPost {
			// ครอบด้วย RequireAuth เพื่อตรวจสอบ Token และถอดสิทธิ์ผู้ใช้
			middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				handlers.CreateSceneHandler(scene, notificationService, chapter, novel, writer, audit)(w, r)
			})).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	mux.Handle("/scenes", scenesHandler)
	mux.Handle("/api/v1/scenes", scenesHandler)

	// 📖 GET /scenes/:id เปิดอ่านได้ทั่วไป (แต่ใช้ OptionalAuth เผื่อมี Token ของผู้ใช้/นักเขียน)
	sceneSubHandler := middleware.RequestLogger(middleware.OptionalAuth(http.HandlerFunc(sceneSubRouter(scene, novel, writer, chapter, social, notificationService, audit))))
	mux.Handle("/scenes/", sceneSubHandler)
	mux.Handle("/api/v1/scenes/", sceneSubHandler)

	choicesHandler := middleware.RequestLogger(middleware.RequireAuth(handlers.CreateChoiceHandler(scene, chapter, novel, writer, audit)))
	mux.Handle("/choices", choicesHandler)
	mux.Handle("/api/v1/choices", choicesHandler)

	choicesSubHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			middleware.RequireAuth(http.HandlerFunc(handlers.UpdateChoiceHandler(scene, chapter, novel, writer, audit))).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			middleware.RequireAuth(http.HandlerFunc(handlers.DeleteChoiceHandler(scene, chapter, novel, writer, audit))).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	mux.Handle("/choices/", choicesSubHandler)
	mux.Handle("/api/v1/choices/", choicesSubHandler)

	// ------------------------------------------

}
