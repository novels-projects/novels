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
	registerHandler := middleware.RequestLogger(http.HandlerFunc(authHandler.Register))
	loginHandler := middleware.RequestLogger(http.HandlerFunc(authHandler.Login))
	refreshHandler := middleware.RequestLogger(http.HandlerFunc(authHandler.Refresh))
	logoutHandler := middleware.RequestLogger(middleware.OptionalAuth(http.HandlerFunc(authHandler.Logout)))

	mux.Handle("/api/register", registerHandler)
	mux.Handle("/api/v1/auth/register", registerHandler)
	mux.Handle("/api/login", loginHandler)
	mux.Handle("/api/v1/auth/login", loginHandler)
	mux.Handle("/api/refresh", refreshHandler)
	mux.Handle("/api/v1/auth/refresh", refreshHandler)
	mux.Handle("/api/logout", logoutHandler)
	mux.Handle("/api/v1/auth/logout", logoutHandler)

	// ดึงข้อมูลผู้ใช้ปัจจุบัน (ต้องมี Token ที่ถูกต้อง)
	userInfoHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(authHandler.GetUserInfo)))
	mux.Handle("/api/users", userInfoHandler)
	mux.Handle("GET /api/v1/users/me", userInfoHandler)

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
	mux.Handle("/api/v1/users/me/username", updateOwnUsernameHandler)

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
	mux.Handle("/api/v1/users/me/email", updateOwnEmailHandler)

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
	mux.Handle("/api/v1/users/me/password", updateOwnPasswordHandler)

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
	mux.Handle("/api/v1/users/me/profile-picture", updateOwnProfilePictureHandler)

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
	mux.Handle("DELETE /api/v1/users/me", deleteOwnAccountHandler)

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
	mux.Handle("/api/v1/users/me/suspend", suspendOwnAccountHandler)

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
	mux.Handle("/api/v1/users/me/notification-settings", notificationSettingsHandler)

	// 🟢 ดึงนิยายที่ผู้ใช้เขียน (ต้องมี Token ที่ถูกต้อง)
	myNovelsHandler := middleware.RequestLogger(middleware.RequireAuth(handlers.GetMyNovelsHandler(novel, writer)))
	mux.Handle("/api/me/novels", myNovelsHandler)
	mux.Handle("/api/v1/writers/me/novels", myNovelsHandler)

	// POST /novels ต้องมีการยืนยันสิทธิ์ ก่อนสร้างนิยาย
	novelsEntryHandler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			middleware.RequireAuth(handlers.NovelsHandler(novel, scene, writer, notificationService, audit)).ServeHTTP(w, r)
			return
		}
		handlers.NovelsHandler(novel, scene, writer, notificationService, audit)(w, r)
	}))
	mux.Handle("/novels", novelsEntryHandler)
	mux.Handle("/api/v1/novels", novelsEntryHandler)

	// 🚨 ท่อฝั่งคนอ่าน: ส่งรายงานนิยาย (บังคับล็อกอินถึงจะรายงานได้)
	reportsHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(reportHandler.CreateReport)))
	mux.Handle("/api/reports", reportsHandler)
	mux.Handle("/api/v1/reports", reportsHandler)

	// 🟢 ท่อฝั่งนักเขียน: ยื่นเรื่องขอปลดแบนนิยาย (บังคับล็อกอินถึงจะยื่นเรื่องได้)
	appealHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(reportHandler.CreateAppeal)))
	mux.Handle("/api/writer/novels/appeal", appealHandler)
	mux.Handle("/api/v1/writer/novels/appeal", appealHandler)

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
