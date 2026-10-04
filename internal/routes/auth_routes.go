package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func registerCoreRoutes(mux *http.ServeMux, flow service.FlowService, scene service.SceneService, novel service.NovelService, writer service.WriterService, notificationService service.NotificationService, analytics service.AnalyticsService, audit service.AuditService, authHandler *handlers.AuthHandler, notificationHandler *handlers.NotificationHandler, reportHandler *handlers.ReportHandler) {
	// 🟢 Health & Authen Endpoints
	// ------------------------------------------
	mux.Handle("/health", middleware.RequestLogger(handlers.HealthCheck(scene)))
	mux.Handle("/", middleware.RequestLogger(handlers.GetRoot(flow)))

	// ผูกลิงก์สมัครสมาชิกกับล็อกอินออกจากระบบเข้าท่อหลัก
	mux.Handle("/api/register", middleware.RequestLogger(http.HandlerFunc(authHandler.Register)))
	mux.Handle("/api/login", middleware.RequestLogger(http.HandlerFunc(authHandler.Login)))
	mux.Handle("/api/refresh", middleware.RequestLogger(http.HandlerFunc(authHandler.Refresh)))
	mux.Handle("/api/logout", middleware.RequestLogger(middleware.OptionalAuth(http.HandlerFunc(authHandler.Logout))))

	// ดึงข้อมูลผู้ใช้ปัจจุบัน (ต้องมี Token ที่ถูกต้อง)
	mux.Handle("/api/users", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(authHandler.GetUserInfo))))

	// 🟢 แก้ไขชื่อผู้ใช้ (Username) ของตัวเอง
	updateOwnUsernameHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			authHandler.UpdateOwnUsername(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/username", updateOwnUsernameHandler)
	mux.Handle("/me/username", updateOwnUsernameHandler)

	// 🟢 แก้ไขอีเมล (Email) ของตัวเอง
	updateOwnEmailHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			authHandler.UpdateOwnEmail(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/email", updateOwnEmailHandler)
	mux.Handle("/me/email", updateOwnEmailHandler)

	// 🟢 แก้ไขรหัสผ่าน (Password) ของตัวเอง
	updateOwnPasswordHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			authHandler.UpdateOwnPassword(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/password", updateOwnPasswordHandler)
	mux.Handle("/me/password", updateOwnPasswordHandler)

	// 🟢 แก้ไขรูปโปรไฟล์ (Profile Picture) ของตัวเอง
	updateOwnProfilePictureHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch || r.Method == http.MethodPut {
			authHandler.UpdateOwnProfilePicture(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/profile-picture", updateOwnProfilePictureHandler)
	mux.Handle("/me/profile-picture", updateOwnProfilePictureHandler)

	// 🟢 ลบบัญชีผู้ใช้ (Delete Account) ของตัวเอง
	deleteOwnAccountHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			authHandler.DeleteOwnAccount(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me", deleteOwnAccountHandler)
	mux.Handle("/me", deleteOwnAccountHandler)

	// 🟢 พักบัญชีผู้ใช้ (Suspend Account) ของตัวเอง
	suspendOwnAccountHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			authHandler.SuspendOwnAccount(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/suspend", suspendOwnAccountHandler)
	mux.Handle("/me/suspend", suspendOwnAccountHandler)

	// 🟢 การตั้งค่าแจ้งเตือน (Notification Settings) ของตัวเอง
	notificationSettingsHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			notificationHandler.GetSettings(w, r)
			return
		}
		if r.Method == http.MethodPatch || r.Method == http.MethodPut {
			notificationHandler.UpdateSettings(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/me/notification-settings", notificationSettingsHandler)
	mux.Handle("/me/notification-settings", notificationSettingsHandler)

	// 🟢 ดึงนิยายที่ผู้ใช้เขียน (ต้องมี Token ที่ถูกต้อง)
	mux.Handle("/api/me/novels", middleware.RequestLogger(middleware.RequireAuth(handlers.GetMyNovelsHandler(novel, writer))))

	// POST /novels ต้องมีการยืนยันสิทธิ์ ก่อนสร้างนิยาย
	mux.Handle("/novels", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			middleware.RequireAuth(handlers.NovelsHandler(novel, scene, writer, notificationService, audit)).ServeHTTP(w, r)
			return
		}
		handlers.NovelsHandler(novel, scene, writer, notificationService, audit)(w, r)
	})))

	// 🚨 ท่อฝั่งคนอ่าน: ส่งรายงานนิยาย (บังคับล็อกอินถึงจะรายงานได้)
	mux.Handle("/api/reports", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(reportHandler.CreateReport))))

	// 🟢 ท่อฝั่งนักเขียน: ยื่นเรื่องขอปลดแบนนิยาย (บังคับล็อกอินถึงจะยื่นเรื่องได้)
	mux.Handle("/api/writer/novels/appeal", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(reportHandler.CreateAppeal))))

	// 🟢 ท่อฝั่งนักเขียน: ดึงสถิตินิยาย (GET /api/v1/writer/novels/:id/analytics & GET /api/v1/writer/novels/:id/analytics/scenes/:sceneId)
	mux.Handle("/api/v1/writer/novels/", middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			middleware.RequireAuth(http.HandlerFunc(handlers.DeleteNovelHandler(novel, writer, audit))).ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodGet {
			if strings.HasSuffix(r.URL.Path, "/analytics/edges") {
				middleware.RequireAuth(handlers.EdgeAnalyticsHandler(analytics, novel, writer)).ServeHTTP(w, r)
				return
			}
			if strings.HasSuffix(r.URL.Path, "/analytics/scenes") {
				middleware.RequireAuth(handlers.AllScenesAnalyticsHandler(analytics, novel, writer)).ServeHTTP(w, r)
				return
			}
			if strings.HasSuffix(r.URL.Path, "/choices") && strings.Contains(r.URL.Path, "/analytics/scenes/") {
				middleware.RequireAuth(handlers.SceneChoiceAnalyticsHandler(analytics, novel, writer)).ServeHTTP(w, r)
				return
			}
			if strings.Contains(r.URL.Path, "/analytics/scenes/") {
				middleware.RequireAuth(handlers.SceneAnalyticsHandler(analytics, novel, writer)).ServeHTTP(w, r)
				return
			}
			if strings.HasSuffix(r.URL.Path, "/analytics") {
				middleware.RequireAuth(handlers.NovelAnalyticsHandler(analytics, novel, writer)).ServeHTTP(w, r)
				return
			}
		}
		http.NotFound(w, r)
	})))

	// ------------------------------------------

}
