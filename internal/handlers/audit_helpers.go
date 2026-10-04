package handlers

import (
	"log"
	"net/http"

	"novel-be/internal/service"
)

func recordAudit(r *http.Request, audit service.AuditService, event service.AuditEvent) {
	if audit == nil {
		return
	}
	event.IPAddress = r.RemoteAddr
	if err := audit.Record(r.Context(), event); err != nil {
		log.Printf("audit log write failed: action=%s target_type=%s target_id=%v error=%v", event.Action, event.TargetType, event.TargetID, err)
	}
}

func recordAuditWithBackendActor(r *http.Request, audit service.AuditService, actorUserID *uint, actorRole string, event service.AuditEvent) {
	if audit == nil {
		return
	}
	event.IPAddress = r.RemoteAddr
	if err := service.RecordWithBackendActor(audit, r.Context(), actorUserID, actorRole, event); err != nil {
		log.Printf("audit log write failed: action=%s target_type=%s target_id=%v error=%v", event.Action, event.TargetType, event.TargetID, err)
	}
}

func int64Pointer(value int) *int64 { converted := int64(value); return &converted }
