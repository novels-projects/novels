package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"novel-be/config"
	"novel-be/internal/db"
	"novel-be/internal/middleware"
	"novel-be/internal/repository"
	"novel-be/internal/routes"
	"novel-be/internal/service"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {

	// -----------------------
	// 1. Load Config
	// -----------------------
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("❌ load config fail: %v", err)
	}
	middleware.SetJWTSecret(cfg.JWTSecret)

	// -----------------------
	// 2. Connect DB
	// -----------------------
	dbConn, err := db.Open(cfg)
	if err != nil {
		log.Fatalf("❌ DB connect fail: %v", err)
	}
	defer dbConn.Close()

	if err := dbConn.Ping(); err != nil {
		log.Fatalf("❌ DB ping fail: %v", err)
	}
	fmt.Println("✅ DB Connected")

	// -----------------------
	// 3. Connect MinIO
	// -----------------------
	minioClient, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		log.Fatalf("❌ MinIO connect fail: %v", err)
	}

	_, err = minioClient.ListBuckets(context.Background())
	if err != nil {
		log.Fatalf("❌ MinIO ping fail: %v", err)
	}
	fmt.Println("✅ MinIO Connected")

	// -----------------------
	// 4. Repositories
	// -----------------------
	novelRepo := repository.NewNovelRepository(dbConn)
	sceneRepo := repository.NewSceneRepository(dbConn)
	chapterRepo := repository.NewChapterRepository(dbConn)
	socialRepo := repository.NewSocialRepository(dbConn)
	readingRepo := repository.NewReadingRepository(dbConn)
	mediaRepo := repository.NewMinIOMediaRepository(minioClient, cfg.MinIOEndpoint)
	categoryRepo := repository.NewCategoryRepository(dbConn)
	authRepo := repository.NewAuthRepository(dbConn)
	writerRepo := repository.NewWriterRepository(dbConn) // 👈 ผูกเชื่อมตารางสมัครนักเขียนเข้าฐานข้อมูลจริง
	reportRepo := repository.NewReportRepository(dbConn)
	auditRepo := repository.NewAuditRepository(dbConn)
	dashboardRepo := repository.NewDashboardRepository(dbConn)

	ctx := context.Background()
	if err := auditRepo.EnsureIndexes(ctx); err != nil {
		log.Printf("⚠️ warning: failed to ensure audit log indexes: %v", err)
	} else {
		fmt.Println("✅ Audit Log Indexes Ready")
	}

	// Ensure MinIO bucket exists
	if err := mediaRepo.EnsureBucketExists(ctx, "novel-buckets"); err != nil {
		log.Fatalf("❌ failed to ensure MinIO bucket: %v", err)
	}
	fmt.Println("✅ MinIO Bucket Ready")

	// -----------------------
	// 5. Services
	// -----------------------
	// 🟢 ย้าย mediaService ขึ้นมาสร้างก่อน เพราะ novelService ต้องใช้งาน
	mediaService := service.NewMediaService(mediaRepo)

	// 🟢 ตอนนี้ส่ง mediaService เข้าไปได้แล้ว
	novelService := service.NewNovelService(novelRepo, mediaService)

	sceneService := service.NewSceneService(sceneRepo, dbConn)
	chapterService := service.NewChapterService(chapterRepo)
	socialService := service.NewSocialService(socialRepo)
	readingService := service.NewReadingService(readingRepo)
	flowService := service.NewFlowService(sceneService)
	categoryService := service.NewCategoryService(categoryRepo)

	// 🟢 สร้างบริการระบบคำขอสมัครนักเขียนแบบสิทธิ์รออนุมัติ
	writerService := service.NewWriterServiceDirect(writerRepo)

	// 🟢 สร้างบริการระบบ Authentication สมาชิกของแท้
	authService := service.NewAuthService(authRepo, cfg.JWTSecret, cfg.JWTRefreshSecret)
	notificationService := service.NewNotificationService(dbConn)
	reportService := service.NewReportService(reportRepo)
	auditService := service.NewAuditService(auditRepo)
	dashboardService := service.NewDashboardService(dashboardRepo)

	// 🟢 ผูก audit service เข้ากับ middleware แบบ decoupled (ผ่าน function type ไม่ import service เข้า middleware ตรงๆ
	// เพราะ audit_service.go import middleware อยู่แล้ว ถ้า middleware import service กลับไปด้วยจะเกิด import cycle)
	// ทำให้ RequireAuth/RequireRole ใน auth_middleware.go บันทึก audit log ได้ตอน token หาย/ผิด/หมดอายุ หรือ role ไม่ตรง
	middleware.SetUnauthorizedRecorder(func(r *http.Request, reason, role string, uid uint, hasUID bool) {
		var actor *uint
		if hasUID {
			actor = &uid
		}
		if err := service.RecordWithBackendActor(auditService, r.Context(), actor, role, service.AuditEvent{
			Action:     "UNAUTHORIZED_ACCESS",
			TargetType: "route",
			Status:     "FAILURE",
			Metadata: map[string]interface{}{
				"path":   r.URL.Path,
				"method": r.Method,
				"reason": reason, // "missing_token" | "invalid_or_expired_token" | "role_mismatch"
			},
		}); err != nil {
			log.Printf("audit log (unauthorized access) write failed: %v", err)
		}
	})

	// 🟢 Analytics Service
	analyticsRepo := repository.NewAnalyticsRepository(dbConn)
	analyticsService := service.NewAnalyticsService(analyticsRepo)

	// สร้าง ServeMux ใหม่
	mux := http.NewServeMux()

	// -----------------------
	// 6. Routes
	// -----------------------
	routes.RegisterRoutes(
		mux,
		flowService,
		novelService,
		chapterService,
		sceneService,
		socialService,
		readingService,
		writerService, // 👈 ส่งมอบบริการคำขอสมัครนักเขียนเข้าสู่กลุ่มเส้นทาง API
		mediaService,
		categoryService,
		*authService, // 👈 ส่งบริการ Authen เข้าพ่วงท้ายแถวโดยใช้ * แกะ Pointer ออกตามโครงสร้างเดิม
		notificationService,
		reportService,
		analyticsService,
		auditService,
		dashboardService,
	)

	// -----------------------
	// 7. Start Server
	// -----------------------
	fmt.Printf("🚀 Server running on port %s\n", cfg.AppPort)
	fmt.Println("📚 Novel Interactive Platform Backend Ready!")

	handler := middleware.CORSMiddleware(mux) // 👈 ใช้ mux ที่เราสร้าง
	err = http.ListenAndServe(":"+cfg.AppPort, handler)
	if err != nil {
		log.Fatalf("❌ server start fail: %v", err)
	}
}
