package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/repository"
	"novel-be/internal/service"
	"strconv"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

// sanitize เผื่ออีกชั้นตอนแอดมินอ่านข้อมูล เพราะข้อมูลเก่าที่ยังไม่ผ่านการ sanitize ตอนบันทึก
// (ก่อนแก้ช่องโหว่นี้) อาจยังมี HTML อันตรายค้างอยู่ใน DB

var adminBioSanitizer = bluemonday.UGCPolicy()

// writerActionStatusCode แปลง sentinel error จาก repository เป็น HTTP status ที่เหมาะสม
// แทนที่จะโยน 500 เหมารวมทุกกรณีเหมือนเดิม (ทำให้แอดมินแยกไม่ออกว่า "หาไม่เจอ" กับ "มีคนทำไปแล้ว" ต่างกันยังไง)
func writerActionStatusCode(err error) int {
	switch {
	case errors.Is(err, repository.ErrWriterApplicationNotFound):
		return http.StatusNotFound
	case errors.Is(err, repository.ErrNotLatestWriterApplication),
		errors.Is(err, repository.ErrWriterApplicationAlreadyProcessed):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

type WriterHandler struct {
	service             service.WriterService
	mediaService        service.MediaService
	notificationService service.NotificationService
	auditService        service.AuditService
}

func NewWriterHandler(s service.WriterService, ms service.MediaService, ns service.NotificationService, auditService service.AuditService) *WriterHandler {
	return &WriterHandler{service: s, mediaService: ms, notificationService: ns, auditService: auditService}
}

// ✍️ 1. ท่อยื่นคำขอเป็นนักเขียน -> POST /api/writers/apply
func (h *WriterHandler) Apply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลผู้ใช้งานใน token")
		return
	}

	var req dto.WriterApplyRequest
	contentType := r.Header.Get("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			WriteError(w, http.StatusBadRequest, "ไม่สามารถประมวลผลข้อมูลจากฟอร์มได้")
			return
		}

		req = dto.WriterApplyRequest{
			NameLastname:    r.FormValue("full_name"),
			PenName:         r.FormValue("pen_name"),
			Bio:             r.FormValue("bio"),
			EmailWriter:     r.FormValue("email"),
			ContactRequired: r.FormValue("main_contact"),
			ContactOptional: r.FormValue("other_links"),
		}

		if categoryIDsValue := r.FormValue("category_ids"); categoryIDsValue != "" {
			_ = json.Unmarshal([]byte(categoryIDsValue), &req.CategoryIDs)
		}

		file, handler, err := r.FormFile("avatar")
		if err != nil && err != http.ErrMissingFile {
			WriteError(w, http.StatusBadRequest, "ไม่สามารถอ่านไฟล์รูปภาพได้")
			return
		}
		if err == nil {
			defer file.Close()
			// avatar ตอนยื่นคำขอสมัครนักเขียน: จำกัด 5MB ตาม VAL-09
			uploadedURL, uploadErr := h.mediaService.UploadImage(r.Context(), handler, service.ProfilePictureMaxBytes)
			if uploadErr != nil {
				writeUploadError(w, uploadErr)
				return
			}
			req.AvatarURL = uploadedURL
		}
	} else {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
			return
		}
	}

	if err := h.service.ApplyForWriter(r.Context(), uint(userID), req); err != nil {
		switch {
		case errors.Is(err, service.ErrAlreadyWriter):
			WriteError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrAlreadyApply),
			errors.Is(err, service.ErrWriterApplyMissingRequired),
			errors.Is(err, service.ErrWriterApplyInvalidEmail),
			errors.Is(err, dto.ErrInvalidWriterInterests):
			WriteError(w, http.StatusBadRequest, err.Error())
		default:
			writeInternalError(w, err)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "ส่งคำขอสมัครเป็นนักเขียนสำเร็จแล้ว รอแอดมินตรวจสอบนะคะ"})
}

// 👑 2. แอดมินดึงข้อมูลคำขอค้างตรวจสอบทั้งหมด -> GET /api/admin/writers/requests
func (h *WriterHandler) GetPendingRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	requests, err := h.service.GetPendingRequests(r.Context(), status, page, limit)
	if err != nil {
		writeInternalError(w, err)
		return
	}

	for i := range requests {
		requests[i].Bio = adminBioSanitizer.Sanitize(requests[i].Bio)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

// ✅ 3. แอดมินกดยืนยันอนุมัตินักเขียน -> POST /api/admin/writers/approve
func (h *WriterHandler) Approve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	writerIDStr := r.URL.Query().Get("writer_id")
	if writerIDStr == "" {
		WriteError(w, http.StatusBadRequest, "ขาดข้อมูลรหัสคำขอนักเขียน (writer_id)")
		return
	}
	writerID, err := strconv.Atoi(writerIDStr)
	if err != nil || writerID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสคำขอนักเขียนไม่ถูกต้อง")
		return
	}

	if err := h.service.ApproveWriter(r.Context(), uint(writerID), adminID); err != nil {
		if status := writerActionStatusCode(err); status == http.StatusInternalServerError {
			writeInternalError(w, err)
		} else {
			WriteError(w, status, err.Error())
		}
		return
	}

	if h.notificationService != nil {
		if err := h.notificationService.NotifyWriterApproved(writerID); err != nil {
			log.Printf("NotifyWriterApproved failed: %v", err)
		}
	}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "APPROVE_WRITER", TargetType: "writer", TargetID: int64Pointer(writerID), Status: "SUCCESS"})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "อนุมัตินักเขียนเรียบร้อยแล้ว ยูสเซอร์ดังกล่าวพร้อมเขียนนิยายแล้วค่ะ!"})
}

func (h *WriterHandler) GetApplicationStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลผู้ใช้งานใน token")
		return
	}

	writer, err := h.service.GetLatestWriterApplicationByUserID(int(userID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"status": "none"})
			return
		}
		writeInternalError(w, err)
		return
	}

	resp := map[string]interface{}{
		"status":    writer.Status,
		"writer_id": writer.WriterID,
		"pen_name":  writer.PenName,
	}
	if writer.Status == "rejected" {
		if writer.RejectionReason != nil {
			resp["rejection_reason"] = *writer.RejectionReason
		}
		if writer.RejectedAt != nil {
			resp["rejected_at"] = *writer.RejectedAt
		}
		resp["full_name"] = writer.NameLastname
		if writer.EmailWriter != nil {
			resp["email"] = *writer.EmailWriter
		}
		if writer.Bio != nil {
			resp["bio"] = *writer.Bio
		}
		resp["avatar_url"] = writer.AvatarURL
		resp["category_ids"] = writer.CategoryIDs

		var contactMap map[string]interface{}
		if str, ok := writer.ContactInfo.(string); ok && str != "" {
			_ = json.Unmarshal([]byte(str), &contactMap)
		}
		if contactMap != nil {
			if primary, ok := contactMap["primary_contact"].(string); ok && primary != "" {
				resp["main_contact"] = primary
			} else if req, ok := contactMap["contact_required"].(string); ok && req != "" {
				resp["main_contact"] = req
			}

			if secondary, ok := contactMap["secondary_contact"].(string); ok && secondary != "" {
				resp["other_links"] = secondary
			} else if opt, ok := contactMap["contact_optional"].(string); ok && opt != "" {
				resp["other_links"] = opt
			}

			if len(writer.CategoryIDs) == 0 {
				if genres, ok := contactMap["genres"].([]interface{}); ok {
					var catIDs []int
					for _, g := range genres {
						if num, ok := g.(float64); ok {
							catIDs = append(catIDs, int(num))
						}
					}
					if len(catIDs) > 0 {
						resp["category_ids"] = catIDs
					}
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *WriterHandler) Reject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	writerIDStr := r.URL.Query().Get("writer_id")
	if writerIDStr == "" {
		WriteError(w, http.StatusBadRequest, "Missing writer_id")
		return
	}

	var writerID uint
	_, err := fmt.Sscanf(writerIDStr, "%d", &writerID)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid writer_id format")
		return
	}

	var req struct {
		RejectionReason string `json:"rejection_reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}

	err = h.service.RejectWriter(r.Context(), writerID, adminID, req.RejectionReason)
	if err != nil {
		WriteError(w, writerActionStatusCode(err), "Failed to reject writer: "+err.Error())
		return
	}

	if h.notificationService != nil {
		if err := h.notificationService.NotifyWriterRejected(int(writerID), req.RejectionReason); err != nil {
			log.Printf("NotifyWriterRejected failed: %v", err)
		}
	}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "REJECT_WRITER", TargetType: "writer", TargetID: int64Pointer(int(writerID)), Status: "SUCCESS", Metadata: map[string]interface{}{"rejection_reason": req.RejectionReason}})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "ปฏิเสธคำขอสมัครนักเขียนเรียบร้อยแล้วค่ะ",
	})
}

// ✏️ PUT /api/writers/me/profile - สำหรับนักเขียนอัปเดตข้อมูลโปรไฟล์ของตนเอง
func (h *WriterHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || userID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลผู้ใช้งานใน token")
		return
	}

	writer, err := h.service.GetWriterByUserID(int(userID))
	if err != nil || writer == nil {
		WriteError(w, http.StatusForbidden, "forbidden: คุณยังไม่ใช่นักเขียนที่ได้รับการอนุมัติ")
		return
	}

	var req dto.UpdateWriterProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.service.UpdateWriterProfile(r.Context(), writer.WriterID, req); err != nil {
		writeInternalError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "อัปเดตโปรไฟล์เรียบร้อยแล้วค่ะ",
	})
}
