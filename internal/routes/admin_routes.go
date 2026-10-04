package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
	"strings"
)

func registerWriterAdminRoutes(mux *http.ServeMux, writerHandler *handlers.WriterHandler, adminUserHandler *handlers.AdminUserHandler, reportHandler *handlers.ReportHandler, auditHandler *handlers.AuditHandler, dashboardHandler *handlers.DashboardHandler, novel service.NovelService, writer service.WriterService, notificationService service.NotificationService, audit service.AuditService, category service.CategoryService) {
	// 🎀 โซนระบบคำขอสมัครเป็นนักเขียน (Writers & Admin Flow)
	// ------------------------------------------
	// ✍️ ท่อฝั่งคนอ่าน: ส่งใบสมัครเข้ามาในระบบ (เริ่มต้นสถานะ pending)
	mux.Handle("/api/writers/apply", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.Apply))))
	mux.Handle("/api/writers/me", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.GetApplicationStatus))))
	mux.Handle("/api/writers/me/profile", middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.UpdateProfile))))

	// 👑 ท่อฝั่งแอดมิน: ดึงใบสมัครทั้งหมดที่ค้างท่ออยู่มาตรวจสอบ
	mux.Handle("/api/admin/writers/requests", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.GetPendingRequests))))

	// 👑 ท่อฝั่งแอดมิน: กดอนุมัติ/ปฏิเสธ อัปเกรดฐานะคำขอให้กลายเป็นนักเขียน
	mux.Handle("/api/admin/writers/approve", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.Approve))))
	mux.Handle("/api/admin/writers/reject", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.Reject))))

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการผู้ใช้
	adminUsersSubRouter := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/username"):
			if r.Method == http.MethodPatch {
				adminUserHandler.AdminUpdateUsername(w, r)
				return
			}
			handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		case strings.HasSuffix(r.URL.Path, "/status"):
			adminUserHandler.UpdateUserStatus(w, r)
		case strings.HasSuffix(r.URL.Path, "/demote"):
			adminUserHandler.DemoteUser(w, r)
		case strings.HasSuffix(r.URL.Path, "/restore-writer"):
			adminUserHandler.RestoreUserWriterAccess(w, r)
		case r.Method == http.MethodDelete:
			adminUserHandler.DeleteUser(w, r)
		default:
			adminUserHandler.GetUserDetail(w, r)
		}
	})))
	mux.Handle("/api/admin/users", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(adminUserHandler.ListUsers))))
	mux.Handle("/api/admin/users/", adminUsersSubRouter)
	mux.Handle("/admin/users/", adminUsersSubRouter)

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการนิยาย
	mux.Handle("/api/admin/novels", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(handlers.AdminNovelListHandler(novel)))))
	mux.Handle("/api/admin/novels/", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/moderation") {
			handlers.AdminNovelModerationHandler(novel, writer, notificationService, audit)(w, r)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/unban") {
			handlers.UnbanNovelHandler(novel, audit)(w, r)
			return
		}
		http.NotFound(w, r)
	}))))

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการรายงานนิยาย
	// GET /api/admin/reports -> ดึงรายการรีพอร์ตแบบ dynamic filter
	mux.Handle("/api/admin/reports", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(reportHandler.GetReports))))

	// PATCH /api/admin/reports/:id/status -> อัปเดตสถานะรีพอร์ต
	mux.Handle("/api/admin/reports/", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(reportHandler.UpdateReportStatus))))

	mux.Handle("/api/admin/audit-logs", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(auditHandler.List))))
	mux.Handle("/api/admin/audit-logs/", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subPath := strings.TrimPrefix(r.URL.Path, "/api/admin/audit-logs/")
		subPath = strings.Trim(subPath, "/")
		if subPath == "metadata" {
			auditHandler.GetMetadata(w, r)
			return
		}
		auditHandler.GetByID(w, r)
	}))))
	mux.Handle("/api/admin/dashboard/summary", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(dashboardHandler.Summary))))
	mux.Handle("/api/admin/dashboard/trend", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(dashboardHandler.Trend))))

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการหมวดหมู่นิยาย
	adminCategoriesSubRouter := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			handlers.AdminUpdateCategoryHandler(category, audit)(w, r)
		case http.MethodDelete:
			handlers.AdminDeleteCategoryHandler(category, audit)(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})))
	mux.Handle("/api/admin/categories", middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			handlers.AdminCreateCategoryHandler(category, audit)(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	}))))
	mux.Handle("/api/admin/categories/", adminCategoriesSubRouter)

	// 🟢 กลุ่มแยกย่อยตาม Resource

}
