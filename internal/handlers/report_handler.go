package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/service"
)

type ReportHandler struct {
	service      service.ReportService
	auditService service.AuditService
}

func NewReportHandler(service service.ReportService, auditService service.AuditService) *ReportHandler {
	return &ReportHandler{service: service, auditService: auditService}
}

// 📌 1. API: รับรีพอร์ตจากคนอ่าน
func (h *ReportHandler) CreateReport(w http.ResponseWriter, r *http.Request) {
	// 🟢 ดึง userID จริงผ่าน Helper Function ของ Middleware (แปลงเป็น int เพื่อส่งต่อให้ service)
	userIDUint, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userIDUint == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized: invalid or missing user token")
		return
	}
	userID := int(userIDUint)

	var req dto.CreateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.service.CreateReport(r.Context(), userID, req); err != nil {
		writeInternalError(w, err)
		return
	}

	reportMeta := map[string]interface{}{
		"novel_id": req.NovelID,
		"reason":   req.Reason,
	}
	recordAudit(r, h.auditService, service.AuditEvent{
		Action:     "SUBMIT_REPORT",
		TargetType: "novel",
		TargetID:   int64Pointer(req.NovelID),
		Status:     "SUCCESS",
		Metadata:   reportMeta,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "report created successfully"})
}

// 📌 2. API: ดึงรายการรีพอร์ตให้แอดมิน
func (h *ReportHandler) GetReports(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	page, limit, err := parseReportPagination(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	statusFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
	if statusFilter == "" {
		statusFilter = "all"
	}
	reportType := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("type")))
	if reportType == "" {
		reportType = "all"
	}
	if reportType != "all" && reportType != "report" && reportType != "appeal" {
		WriteError(w, http.StatusBadRequest, "type must be all, report, or appeal")
		return
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	reports, total, err := h.service.GetReports(r.Context(), statusFilter, reportType, search, page, limit)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get reports")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"reports": reports,
		"page":    page,
		"limit":   limit,
		"total":   total,
	})
}

func parseReportPagination(r *http.Request) (int, int, error) {
	page := 1
	limit := 20
	query := r.URL.Query()

	if value := query.Get("page"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 {
			return 0, 0, errors.New("invalid page")
		}
		page = parsed
	}
	if value := query.Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 100 {
			return 0, 0, errors.New("limit must be between 1 and 100")
		}
		limit = parsed
	}
	return page, limit, nil
}

// 📌 3. API: แอดมินกดเปลี่ยนสถานะรีพอร์ต
func (h *ReportHandler) UpdateReportStatus(w http.ResponseWriter, r *http.Request) {
	// 🟢 1. ตรวจสอบว่าต้องเป็น PATCH Method เท่านั้น
	if r.Method != http.MethodPatch {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// 🟢 2. ดึง report_id จาก URL Path (เช่น ตัด /api/admin/reports/ และ /status ออก)
	reportID, err := extractAdminIDFromPath(r.URL.Path, "reports", "/status")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid report ID")
		return
	}

	var req dto.UpdateReportStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		WriteError(w, http.StatusBadRequest, "admin reason is required")
		return
	}

	previousStatus, reportType, novelID, novelTitle, authorID, novelStatus, novelIsPublished, err := h.service.GetReportDetail(r.Context(), reportID)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if err := h.service.UpdateReportStatus(r.Context(), reportID, req); err != nil {
		if errors.Is(err, service.ErrInvalidReportTransition) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}
	reportMetadata := map[string]interface{}{"old_status": previousStatus, "new_status": req.Status, "report_type": reportType, "reason": req.Reason}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "UPDATE_REPORT_STATUS", TargetType: "report", TargetID: int64Pointer(reportID), Status: "SUCCESS", Metadata: reportMetadata})
	if reportType == "report" && previousStatus == "pending" && req.Status == "resolved" && novelStatus == "published" && novelIsPublished {
		recordAudit(r, h.auditService, service.AuditEvent{
			Action:     "SUSPEND_NOVEL",
			TargetType: "novel",
			TargetID:   int64Pointer(novelID),
			Status:     "SUCCESS",
			Metadata: map[string]interface{}{
				"novel_id":        novelID,
				"title":           novelTitle,
				"author_id":       authorID,
				"previous_status": "published",
				"new_status":      "suspended",
				"reason":          req.Reason,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "status updated successfully"})
}

// 📌 4. API: รับเรื่องขอปลดแบนจากนักเขียน (POST /api/writer/novels/appeal)
func (h *ReportHandler) CreateAppeal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// ดึง userID ของนักเขียนจาก Token
	userIDUint, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userIDUint == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req dto.CreateAppealRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.NovelID <= 0 || req.Reason == "" {
		WriteError(w, http.StatusBadRequest, "novel_id and reason are required")
		return
	}

	if err := h.service.CreateAppeal(r.Context(), int(userIDUint), req); err != nil {
		writeInternalError(w, err)
		return
	}

	appealMeta := map[string]interface{}{
		"novel_id": req.NovelID,
		"reason":   req.Reason,
	}
	recordAudit(r, h.auditService, service.AuditEvent{
		Action:     "SUBMIT_APPEAL",
		TargetType: "novel",
		TargetID:   int64Pointer(req.NovelID),
		Status:     "SUCCESS",
		Metadata:   appealMeta,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "appeal submitted successfully"})
}
