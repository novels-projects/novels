package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"novel-be/internal/dto"
	"novel-be/internal/models"
	"novel-be/internal/service"
)

type AuditHandler struct{ service service.AuditService }

func NewAuditHandler(audit service.AuditService) *AuditHandler { return &AuditHandler{service: audit} }

func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	filter, err := parseAuditFilter(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	logs, total, err := h.service.List(r.Context(), filter)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list audit logs")
		return
	}
	items := make([]dto.AuditLogResponse, 0, len(logs))
	for _, item := range logs {
		items = append(items, auditResponse(item))
	}
	WriteJSON(w, http.StatusOK, dto.AuditLogListResponse{Items: items, Page: filter.Page, Limit: filter.Limit, Total: total})
}

func (h *AuditHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	id, err := extractAuditLogID(r.URL.Path)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid audit log id")
		return
	}
	item, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get audit log")
		return
	}
	if item == nil {
		WriteError(w, http.StatusNotFound, "audit log not found")
		return
	}
	WriteJSON(w, http.StatusOK, auditResponse(*item))
}

func extractAuditLogID(path string) (int64, error) {
	for _, prefix := range []string{"/api/v1/admin/audit-logs/", "/api/admin/audit-logs/"} {
		if strings.HasPrefix(path, prefix) {
			path = strings.TrimPrefix(path, prefix)
			break
		}
	}

	id, err := strconv.ParseInt(strings.Trim(path, "/"), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid audit log id")
	}
	return id, nil
}

func (h *AuditHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	metadata, err := h.service.GetMetadata(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to get audit metadata")
		return
	}
	WriteJSON(w, http.StatusOK, metadata)
}

func parseAuditFilter(r *http.Request) (dto.AuditLogFilter, error) {
	query := r.URL.Query()
	filter := dto.AuditLogFilter{Action: strings.TrimSpace(query.Get("action")), TargetType: strings.TrimSpace(query.Get("target_type")), Status: strings.TrimSpace(query.Get("status")), Page: 1, Limit: 50}
	parseInt := func(name string) (int64, error) { return strconv.ParseInt(query.Get(name), 10, 64) }
	if value := query.Get("actor"); value != "" {
		trimmed := strings.TrimSpace(value)
		if id, err := strconv.ParseInt(trimmed, 10, 64); err == nil && id > 0 {
			actor := uint(id)
			filter.ActorUserID = &actor
		}
		filter.ActorKeyword = trimmed
	} else if value := query.Get("actor_user_id"); value != "" {
		parsed, err := parseInt("actor_user_id")
		if err != nil || parsed <= 0 {
			return filter, errors.New("invalid actor_user_id")
		}
		actor := uint(parsed)
		filter.ActorUserID = &actor
	}
	if value := query.Get("target_id"); value != "" {
		parsed, err := parseInt("target_id")
		if err != nil || parsed <= 0 {
			return filter, errors.New("invalid target_id")
		}
		filter.TargetID = &parsed
	}
	if value := query.Get("page"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 {
			return filter, errors.New("invalid page")
		}
		filter.Page = parsed
	}
	if value := query.Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 100 {
			return filter, errors.New("limit must be between 1 and 100")
		}
		filter.Limit = parsed
	}
	parseTime := func(name string) (*time.Time, error) {
		value := query.Get(name)
		if value == "" {
			return nil, nil
		}
		parsed, err := time.Parse(time.RFC3339, value)
		return &parsed, err
	}
	var err error
	if filter.DateFrom, err = parseTime("date_from"); err != nil {
		return filter, errors.New("invalid date_from")
	}
	if filter.DateTo, err = parseTime("date_to"); err != nil {
		return filter, errors.New("invalid date_to")
	}
	if filter.DateFrom != nil && filter.DateTo != nil && !filter.DateFrom.Before(*filter.DateTo) {
		return filter, errors.New("date_from must be before date_to")
	}
	return filter, nil
}

func auditResponse(item models.AuditLog) dto.AuditLogResponse {
	var metadata interface{}
	if len(item.Metadata) > 0 {
		_ = json.Unmarshal(item.Metadata, &metadata)
	}
	return dto.AuditLogResponse{
		LogID:         item.LogID,
		ActorUserID:   item.ActorUserID,
		ActorUsername: item.ActorUsername,
		ActorRole:     item.ActorRole,
		Action:        item.Action,
		TargetType:    item.TargetType,
		TargetID:      item.TargetID,
		TargetName:    item.TargetName,
		Status:        item.Status,
		IPAddress:     item.IPAddress,
		Metadata:      metadata,
		CreatedAt:     item.CreatedAt,
	}
}
