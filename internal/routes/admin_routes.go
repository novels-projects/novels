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
	// 🎀 โซนระบบคำขอสมัครเป็นนักเขียน (Writers & Admin Flow)
	// ------------------------------------------
	// ✍️ ท่อฝั่งคนอ่าน: ส่งใบสมัครเข้ามาในระบบ (เริ่มต้นสถานะ pending)
	writerApplyHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.Apply)))
	mux.Handle("/api/writers/apply", writerApplyHandler)
	mux.Handle("/api/v1/writers/apply", writerApplyHandler)

	writerMeHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.GetApplicationStatus)))
	mux.Handle("/api/writers/me", writerMeHandler)
	mux.Handle("/api/v1/writers/me/application", writerMeHandler)
	mux.Handle("/api/v1/writers/me", writerMeHandler)

	writerProfileHandler := middleware.RequestLogger(middleware.RequireAuth(http.HandlerFunc(writerHandler.UpdateProfile)))
	mux.Handle("/api/writers/me/profile", writerProfileHandler)
	mux.Handle("/api/v1/writers/me/profile", writerProfileHandler)

	// 👑 ท่อฝั่งแอดมิน: ดึงใบสมัครทั้งหมดที่ค้างท่ออยู่มาตรวจสอบ
	adminWritersReqHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.GetPendingRequests)))
	mux.Handle("/api/admin/writers/requests", adminWritersReqHandler)
	mux.Handle("/api/v1/admin/writers/requests", adminWritersReqHandler)

	// 👑 ท่อฝั่งแอดมิน: กดอนุมัติ/ปฏิเสธ อัปเกรดฐานะคำขอให้กลายเป็นนักเขียน
	adminWritersApproveHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.Approve)))
	mux.Handle("/api/admin/writers/approve", adminWritersApproveHandler)
	mux.Handle("/api/v1/admin/writers/approve", adminWritersApproveHandler)

	adminWritersRejectHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(writerHandler.Reject)))
	mux.Handle("/api/admin/writers/reject", adminWritersRejectHandler)
	mux.Handle("/api/v1/admin/writers/reject", adminWritersRejectHandler)

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
	adminUsersListHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(adminUserHandler.ListUsers)))
	mux.Handle("/api/admin/users", adminUsersListHandler)
	mux.Handle("/api/admin/users/", adminUsersSubRouter)
	mux.Handle("/admin/users/", adminUsersSubRouter)
	mux.Handle("/api/v1/admin/users", adminUsersListHandler)
	mux.Handle("/api/v1/admin/users/", adminUsersSubRouter)

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการนิยาย
	adminNovelsListHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(handlers.AdminNovelListHandler(novel))))
	mux.Handle("/api/admin/novels", adminNovelsListHandler)
	mux.Handle("/api/v1/admin/novels", adminNovelsListHandler)

	adminNovelsSubRouter := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/moderation") {
			handlers.AdminNovelModerationHandler(novel, writer, notificationService, audit)(w, r)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/unban") {
			handlers.UnbanNovelHandler(novel, audit)(w, r)
			return
		}
		http.NotFound(w, r)
	})))
	mux.Handle("/api/admin/novels/", adminNovelsSubRouter)
	mux.Handle("/api/v1/admin/novels/", adminNovelsSubRouter)

	// 👑 ท่อฝั่งแอดมิน: ระบบจัดการรายงานนิยาย
	adminReportsHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(reportHandler.GetReports)))
	mux.Handle("/api/admin/reports", adminReportsHandler)
	mux.Handle("/api/v1/admin/reports", adminReportsHandler)

	adminReportsSubRouter := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(reportHandler.UpdateReportStatus)))
	mux.Handle("/api/admin/reports/", adminReportsSubRouter)
	mux.Handle("/api/v1/admin/reports/", adminReportsSubRouter)

	adminAuditListHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(auditHandler.List)))
	mux.Handle("/api/admin/audit-logs", adminAuditListHandler)
	mux.Handle("/api/v1/admin/audit-logs", adminAuditListHandler)

	adminAuditSubRouter := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subPath := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/audit-logs/")
		subPath = strings.TrimPrefix(subPath, "/api/admin/audit-logs/")
		subPath = strings.Trim(subPath, "/")
		if subPath == "metadata" {
			auditHandler.GetMetadata(w, r)
			return
		}
		auditHandler.GetByID(w, r)
	})))
	mux.Handle("/api/admin/audit-logs/", adminAuditSubRouter)
	mux.Handle("/api/v1/admin/audit-logs/", adminAuditSubRouter)

	adminDashboardSummaryHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(dashboardHandler.Summary)))
	mux.Handle("/api/admin/dashboard/summary", adminDashboardSummaryHandler)
	mux.Handle("/api/v1/admin/dashboard/summary", adminDashboardSummaryHandler)

	adminDashboardTrendHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(dashboardHandler.Trend)))
	mux.Handle("/api/admin/dashboard/trend", adminDashboardTrendHandler)
	mux.Handle("/api/v1/admin/dashboard/trend", adminDashboardTrendHandler)

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
	adminCreateCategoryHandler := middleware.RequestLogger(middleware.RequireRole("admin", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			handlers.AdminCreateCategoryHandler(category, audit)(w, r)
			return
		}
		handlers.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
	})))
	mux.Handle("/api/admin/categories", adminCreateCategoryHandler)
	mux.Handle("/api/v1/admin/categories", adminCreateCategoryHandler)
	mux.Handle("/api/admin/categories/", adminCategoriesSubRouter)
	mux.Handle("/api/v1/admin/categories/", adminCategoriesSubRouter)

	// 🟢 กลุ่มแยกย่อยตาม Resource

}
