package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/service"
)

func RegisterRoutes(
	mux *http.ServeMux,
	flow service.FlowService,
	novel service.NovelService,
	chapter service.ChapterService,
	scene service.SceneService,
	social service.SocialService,
	reading service.ReadingService,
	writer service.WriterService,
	media service.MediaService,
	category service.CategoryService,
	auth service.AuthService,
	notificationService service.NotificationService,
	reportService service.ReportService,
	analytics service.AnalyticsService,
	audit service.AuditService,
	dashboard service.DashboardService,
) {
	// ประกาศตัวด่านหน้าสำหรับ Authen และ ระบบคำขอนักเขียน
	authHandler := handlers.NewAuthHandler(&auth, media, audit)
	writerHandler := handlers.NewWriterHandler(writer, media, notificationService, audit)
	adminUserHandler := handlers.NewAdminUserHandler(auth, audit)
	notificationHandler := handlers.NewNotificationHandler(notificationService)
	reportHandler := handlers.NewReportHandler(reportService, audit)
	auditHandler := handlers.NewAuditHandler(audit)
	dashboardHandler := handlers.NewDashboardHandler(dashboard)

	// ------------------------------------------
	registerCoreRoutes(mux, flow, scene, novel, writer, notificationService, analytics, audit, authHandler, notificationHandler, reportHandler)
	registerWriterAdminRoutes(mux, writerHandler, adminUserHandler, reportHandler, auditHandler, dashboardHandler, novel, writer, notificationService, audit, category)
	registerResourceRoutes(mux, category, novel, scene, chapter, social, writer, reading, notificationService, audit)
	registerMediaRoutes(mux, media, novel)
	registerReadingSocialRoutes(mux, reading, social, notificationService, scene, novel, writer, chapter)
	registerNotificationRoutes(mux, notificationHandler)
}
