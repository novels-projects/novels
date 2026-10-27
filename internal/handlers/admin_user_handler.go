package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

type AdminUserHandler struct {
	authService  service.AuthService
	auditService service.AuditService
}

func adminUserIDFromPath(path, suffix string) (int, error) {
	path = stripAPIVersionPrefix(path)
	path = strings.TrimPrefix(path, "/api/admin/users/")
	path = strings.TrimPrefix(path, "/admin/users/")
	path = strings.TrimSuffix(path, suffix)
	return strconv.Atoi(strings.Trim(path, "/"))
}

func NewAdminUserHandler(authService service.AuthService, auditService service.AuditService) *AdminUserHandler {
	return &AdminUserHandler{authService: authService, auditService: auditService}
}

func (h *AdminUserHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	role := strings.TrimSpace(r.URL.Query().Get("role"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	users, err := h.authService.ListUsers(r.Context(), role, status, search, page, limit)
	if err != nil {
		writeInternalError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"users": users})
}

func (h *AdminUserHandler) GetUserDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	user, err := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if user == nil {
		WriteError(w, http.StatusNotFound, "ไม่พบผู้ใช้งาน")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *AdminUserHandler) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "/status")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Status string  `json:"status"`
		Reason *string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}
	if req.Status != "active" && req.Status != "suspended" {
		WriteError(w, http.StatusBadRequest, "status ต้องเป็น active หรือ suspended เท่านั้น")
		return
	}

	var suspendedAt *time.Time
	if req.Status == "suspended" {
		now := time.Now().UTC()
		suspendedAt = &now
	}

	if uint(userID) == adminID {
		WriteError(w, http.StatusForbidden, "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
		return
	}

	reason := ""
	if req.Reason != nil {
		reason = strings.TrimSpace(*req.Reason)
	}

	previous, _ := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	err = h.authService.UpdateUserStatus(r.Context(), uint(userID), req.Status, reason, suspendedAt, adminID)
	if err != nil {
		if strings.Contains(err.Error(), "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้") {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}
	action := "UNSUSPEND_USER"
	if req.Status == "suspended" {
		action = "SUSPEND_USER"
	}
	metadata := map[string]interface{}{"new_status": req.Status, "reason": reason}
	if previous != nil {
		metadata["previous_status"] = previous.Status
	}
	recordAudit(r, h.auditService, service.AuditEvent{Action: action, TargetType: "user", TargetID: int64Pointer(userID), Status: "SUCCESS", Metadata: metadata})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "อัปเดตสถานะผู้ใช้สำเร็จแล้ว"})
}

func (h *AdminUserHandler) DemoteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "/demote")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if uint(userID) == adminID {
		WriteError(w, http.StatusForbidden, "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
		return
	}

	previous, _ := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	err = h.authService.DemoteUserToReader(r.Context(), uint(userID), adminID)
	if err != nil {
		if strings.Contains(err.Error(), "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้") {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}
	metadata := map[string]interface{}{"new_role": "reader"}
	if previous != nil {
		metadata["previous_role"] = previous.Role
	}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "DEMOTE_USER", TargetType: "user", TargetID: int64Pointer(userID), Status: "SUCCESS", Metadata: metadata})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "ย้ายสถานะผู้ใช้เป็น reader สำเร็จแล้ว"})
}

func (h *AdminUserHandler) RestoreUserWriterAccess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "/restore-writer")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if uint(userID) == adminID {
		WriteError(w, http.StatusForbidden, "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
		return
	}

	previous, _ := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	err = h.authService.RestoreUserWriterAccess(r.Context(), uint(userID), adminID)
	if err != nil {
		if errors.Is(err, repository.ErrUserRoleNotReader) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if errors.Is(err, repository.ErrUserHasNoPriorRevokedWriterHistory) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if strings.Contains(err.Error(), "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้") {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}
	metadata := map[string]interface{}{"new_role": "writer"}
	if previous != nil {
		metadata["previous_role"] = previous.Role
	}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "RESTORE_WRITER_ACCESS", TargetType: "user", TargetID: int64Pointer(userID), Status: "SUCCESS", Metadata: metadata})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "คืนสิทธิ์นักเขียนสำเร็จแล้ว"})
}

func (h *AdminUserHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if uint(userID) == adminID {
		WriteError(w, http.StatusForbidden, "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
		return
	}

	hasWriterNovels, err := h.authService.HasWriterNovels(r.Context(), uint(userID))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if hasWriterNovels {
		WriteError(w, http.StatusConflict, "ต้องระงับบัญชีแทนการลบ เนื่องจากมีนิยายอยู่ในระบบ")
		return
	}

	previous, err := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if previous == nil {
		WriteError(w, http.StatusNotFound, "ไม่พบผู้ใช้งาน")
		return
	}
	err = h.authService.DeleteUser(r.Context(), uint(userID), adminID)
	if err != nil {
		if strings.Contains(err.Error(), "ไม่สามารถดำเนินการกับบัญชีของตัวเองได้") {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, errors.New("must not delete")) {
			WriteError(w, http.StatusConflict, "ต้องระงับบัญชีแทนการลบ เนื่องจากมีนิยายอยู่ในระบบ")
			return
		}
		writeInternalError(w, err)
		return
	}
	metadata := map[string]interface{}{"username": previous.Username, "email": previous.Email, "role": previous.Role, "status": previous.Status}
	recordAudit(r, h.auditService, service.AuditEvent{Action: "DELETE_USER", TargetType: "user", TargetID: int64Pointer(userID), Status: "SUCCESS", Metadata: metadata})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "ลบผู้ใช้สำเร็จแล้ว"})
}

func (h *AdminUserHandler) AdminUpdateUsername(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := adminUserIDFromPath(r.URL.Path, "/username")
	if err != nil || userID <= 0 {
		WriteError(w, http.StatusBadRequest, "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	adminID, ok := middleware.GetUserIDFromContext(r.Context())
	if !ok || adminID == 0 {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req dto.UpdateUsernameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "รูปแบบข้อมูลไม่ถูกต้อง")
		return
	}

	previous, _ := h.authService.GetUserForAdmin(r.Context(), uint(userID))
	oldUsername := ""
	if previous != nil {
		oldUsername = previous.Username
	}

	err = h.authService.UpdateUsername(r.Context(), uint(userID), req.Username)
	if err != nil {
		if errors.Is(err, repository.ErrUsernameTaken) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if err.Error() == "user not found" {
			WriteError(w, http.StatusNotFound, "ไม่พบผู้ใช้งาน")
			return
		}
		if err.Error() == "username is required" ||
			err.Error() == "username length must be between 3 and 50 characters" ||
			err.Error() == "username must contain only letters, numbers, and underscores" {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}

	metadata := map[string]interface{}{
		"field":        "username",
		"old_username": oldUsername,
		"new_username": req.Username,
	}
	recordAudit(r, h.auditService, service.AuditEvent{
		Action:     "ADMIN_UPDATE_USERNAME",
		TargetType: "user",
		TargetID:   int64Pointer(userID),
		Status:     "SUCCESS",
		Metadata:   metadata,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "username updated successfully"})
}
