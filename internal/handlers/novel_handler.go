package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

func NovelsHandler(novelService service.NovelService, sceneService service.SceneService, writerService service.WriterService, notificationService service.NotificationService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			novels, err := novelService.ListNovels()
			if err != nil {
				writeInternalError(w, err)
				return
			}
			WriteJSON(w, http.StatusOK, novels)
		case http.MethodPost:
			userID, ok := middleware.GetUserIDFromContext(r.Context())
			if !ok || userID == 0 {
				WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลสิทธิ์ผู้ใช้งานหรือโทเคนไม่ถูกต้อง")
				return
			}

			writer, err := writerService.GetWriterByUserID(int(userID))
			if err != nil || writer == nil {
				WriteError(w, http.StatusForbidden, "forbidden: คุณยังไม่ใช่นักเขียนที่ได้รับอนุมัติ")
				return
			}

			var req CreateNovelRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				WriteError(w, http.StatusBadRequest, "invalid request body")
				return
			}
			if err := req.Validate(); err != nil {
				WriteError(w, http.StatusBadRequest, err.Error())
				return
			}

			resolvedStatus, isPublished, isCompleted := resolveNovelStatus(req.Status, req.IsPublished, req.IsCompleted)
			newNovel := models.Novel{
				Title:        req.Title,
				Captions:     req.Captions,
				Introduction: req.Introduction,
				CoverImage:   req.CoverImage,
				Status:       resolvedStatus,
				IsPublished:  isPublished,
				IsCompleted:  isCompleted,
				CategoryIDs:  req.CategoryIDs,
				AuthorID:     writer.WriterID,
			}
			novelID, err := novelService.CreateNovel(newNovel)
			if err != nil {
				if errors.Is(err, repository.ErrCategoryNotFound) {
					WriteError(w, http.StatusBadRequest, err.Error())
					return
				}
				writeInternalError(w, err)
				return
			}
			recordAudit(r, auditService, service.AuditEvent{Action: "CREATE_NOVEL", TargetType: "novel", TargetID: int64Pointer(novelID), Status: "SUCCESS", Metadata: map[string]interface{}{"title": req.Title, "status": resolvedStatus}})
			if isPublished && notificationService != nil {
				if err := notificationService.NotifyNewNovelPublished(novelID); err != nil {
					log.Printf("NotifyNewNovelPublished failed: %v", err)
				}
			}
			WriteJSON(w, http.StatusCreated, map[string]any{"message": "novel created", "novel_id": novelID})
		default:
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	}
}

func normalizeAdminNovelStatus(raw string) string {
	status := strings.ToLower(strings.TrimSpace(raw))
	if status == "" {
		return "all"
	}
	return status
}

func AdminNovelListHandler(novelService service.NovelService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		page, limit, err := parseAdminNovelPagination(r)
		if err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		status := normalizeAdminNovelStatus(r.URL.Query().Get("status"))
		if status != "all" && status != "published" && status != "suspended" {
			WriteError(w, http.StatusBadRequest, "status must be all, published, or suspended")
			return
		}

		categoryID := 0
		if value := r.URL.Query().Get("category_id"); value != "" {
			categoryID, err = strconv.Atoi(value)
			if err != nil || categoryID <= 0 {
				WriteError(w, http.StatusBadRequest, "invalid category_id")
				return
			}
		}

		novels, total, err := novelService.ListAdminNovels(r.Context(), r.URL.Query().Get("search"), status, categoryID, page, limit)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to get admin novels")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(dto.AdminNovelListResponse{Novels: novels, Page: page, Limit: limit, Total: total})
	}
}

func parseAdminNovelPagination(r *http.Request) (int, int, error) {
	page := 1
	limit := 20
	if value := r.URL.Query().Get("page"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 {
			return 0, 0, errors.New("invalid page")
		}
		page = parsed
	}
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 100 {
			return 0, 0, errors.New("limit must be between 1 and 100")
		}
		limit = parsed
	}
	return page, limit, nil
}

func AdminNovelModerationHandler(novelService service.NovelService, writerService service.WriterService, notificationService service.NotificationService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		novelID, err := extractAdminNovelID(r.URL.Path, "/moderation")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		var req dto.AdminNovelModerationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		action := strings.ToLower(strings.TrimSpace(req.Action))
		if action != "suspend" && action != "delete" {
			WriteError(w, http.StatusBadRequest, "action must be suspend or delete")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}
		novel, ok := novelDetail.(*models.Novel)
		if !ok || novel == nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		metadata := map[string]interface{}{
			"novel_id":        novelID,
			"title":           novel.Title,
			"author_id":       novel.AuthorID,
			"previous_status": novel.Status,
			"reason":          strings.TrimSpace(req.Reason),
		}
		authorName := ""
		writer, writerErr := writerService.GetWriterByID(novel.AuthorID)
		if writerErr == nil && writer != nil {
			if writer.UserID > 0 {
				metadata["author_user_id"] = writer.UserID
			}
			if strings.TrimSpace(writer.PenName) != "" {
				authorName = strings.TrimSpace(writer.PenName)
			} else if strings.TrimSpace(writer.Username) != "" {
				authorName = strings.TrimSpace(writer.Username)
			} else if strings.TrimSpace(writer.NameLastname) != "" {
				authorName = strings.TrimSpace(writer.NameLastname)
			}
		}
		if authorName == "" {
			if strings.TrimSpace(novel.PenName) != "" {
				authorName = strings.TrimSpace(novel.PenName)
			} else if strings.TrimSpace(novel.AuthorName) != "" {
				authorName = strings.TrimSpace(novel.AuthorName)
			}
		}
		if authorName == "" {
			authorName = fmt.Sprintf("นักเขียน #%d", novel.AuthorID)
		}
		metadata["author_name"] = authorName
		if action == "suspend" {
			if strings.TrimSpace(req.Reason) == "" {
				WriteError(w, http.StatusBadRequest, "admin reason is required when suspending a novel")
				return
			}
			if novel.Status != "published" {
				WriteError(w, http.StatusConflict, "only published novels can be suspended")
				return
			}
			if err := novelService.SuspendNovel(r.Context(), novelID); err != nil {
				writeInternalError(w, err)
				return
			}
			if writer != nil && writer.UserID > 0 {
				referenceID := novelID
				referenceType := "novel"
				cover := novel.CoverImage
				if _, notifyErr := notificationService.CreateNotification(writer.UserID, 0, "system", "นิยายถูกระงับการเผยแพร่", "นิยายเรื่อง '"+novel.Title+"' ถูกระงับโดยแอดมิน เนื่องจาก: "+strings.TrimSpace(req.Reason), coverPtrFromStringPtr(cover), &referenceID, &referenceType); notifyErr != nil {
					log.Printf("CreateNotification for suspended novel failed: %v", notifyErr)
				}
			}
			metadata["new_status"] = "suspended"
			recordAudit(r, auditService, service.AuditEvent{Action: "SUSPEND_NOVEL", TargetType: "novel", TargetID: int64Pointer(novelID), Status: "SUCCESS", Metadata: metadata})
			writeNovelActionResponse(w, "novel suspended")
			return
		}

		if strings.TrimSpace(req.Reason) == "" {
			WriteError(w, http.StatusBadRequest, "admin reason is required when deleting a novel")
			return
		}

		if err := novelService.DeleteNovel(novelID); err != nil {
			writeInternalError(w, err)
			return
		}
		if writer != nil && writer.UserID > 0 {
			referenceID := novelID
			referenceType := "novel"
			cover := novel.CoverImage
			if _, notifyErr := notificationService.CreateNotification(writer.UserID, 0, "system", "นิยายถูกลบออกจากระบบ", "นิยายเรื่อง '"+novel.Title+"' ถูกลบโดยแอดมิน เนื่องจาก: "+strings.TrimSpace(req.Reason), coverPtrFromStringPtr(cover), &referenceID, &referenceType); notifyErr != nil {
				log.Printf("CreateNotification for deleted novel failed: %v", notifyErr)
			}
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "DELETE_NOVEL", TargetType: "novel", TargetID: int64Pointer(novelID), Status: "SUCCESS", Metadata: metadata})
		writeNovelActionResponse(w, "novel deleted")
	}
}

func coverPtrFromStringPtr(value *string) *string {
	if value == nil || *value == "" {
		return nil
	}
	return value
}

func writeNovelActionResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

func extractAdminNovelID(path, suffix string) (int, error) {
	path = stripAPIVersionPrefix(path)
	trimmed := strings.TrimSuffix(strings.Trim(path, "/"), strings.Trim(suffix, "/"))
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	var idPath string
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "novels" {
		idPath = parts[3]
	} else if len(parts) == 3 && parts[0] == "admin" && parts[1] == "novels" {
		idPath = parts[2]
	} else {
		return 0, errors.New("invalid path")
	}
	id, err := strconv.Atoi(idPath)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid novel id")
	}
	return id, nil
}

func DeleteNovelHandler(novelService service.NovelService, writerService service.WriterService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		novelID, err := extractNovelIDFromPath(r.URL.Path)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลสิทธิ์ผู้ใช้งานหรือโทเคนไม่ถูกต้อง")
			return
		}

		writer, err := writerService.GetWriterByUserID(int(userID))
		if err != nil || writer == nil {
			WriteError(w, http.StatusForbidden, "forbidden: คุณยังไม่ใช่นักเขียนที่ได้รับอนุมัติ")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			writeInternalError(w, err)
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		if novelPtr.AuthorID != writer.WriterID {
			WriteError(w, http.StatusForbidden, "forbidden: คุณไม่มีสิทธิ์ลบนิยายนี้")
			return
		}

		if err := novelService.DeleteNovel(novelID); err != nil {
			writeInternalError(w, err)
			return
		}
		authorName := strings.TrimSpace(writer.PenName)
		if authorName == "" {
			authorName = strings.TrimSpace(writer.Username)
		}
		if authorName == "" {
			authorName = fmt.Sprintf("นักเขียน #%d", writer.WriterID)
		}
		recordAudit(r, auditService, service.AuditEvent{Action: "DELETE_NOVEL", TargetType: "novel", TargetID: int64Pointer(novelID), Status: "SUCCESS", Metadata: map[string]interface{}{"title": novelPtr.Title, "status": novelPtr.Status, "author_id": novelPtr.AuthorID, "author_name": authorName}})

		WriteJSON(w, http.StatusOK, map[string]string{"message": "novel deleted"})
	}
}

func UpdateNovelHandler(novelService service.NovelService, sceneService service.SceneService, writerService service.WriterService, notificationService service.NotificationService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		novelID, err := extractNovelIDFromPath(r.URL.Path)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		userID, ok := middleware.GetUserIDFromContext(r.Context())
		if !ok || userID == 0 {
			WriteError(w, http.StatusUnauthorized, "unauthorized: ไม่พบข้อมูลสิทธิ์ผู้ใช้งานหรือโทเคนไม่ถูกต้อง")
			return
		}

		writer, err := writerService.GetWriterByUserID(int(userID))
		if err != nil || writer == nil {
			WriteError(w, http.StatusForbidden, "forbidden: คุณยังไม่ใช่นักเขียนที่ได้รับอนุมัติ")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(novelID)
		if err != nil {
			writeInternalError(w, err)
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		if novelPtr.AuthorID != writer.WriterID {
			WriteError(w, http.StatusForbidden, "forbidden: คุณไม่มีสิทธิ์แก้ไขนิยายนี้")
			return
		}

		var req UpdateNovelRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if err := req.Validate(); err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		title := novelPtr.Title
		captions := novelPtr.Captions
		introduction := novelPtr.Introduction
		coverImage := novelPtr.CoverImage
		categoryIDs := novelPtr.CategoryIDs

		if strings.TrimSpace(req.Title) != "" {
			title = req.Title
		}
		if req.Captions != nil {
			captions = req.Captions
		}
		if req.Introduction != nil {
			introduction = req.Introduction
		}
		if req.CoverImage != nil {
			coverImage = req.CoverImage
		}
		if len(req.CategoryIDs) > 0 {
			categoryIDs = req.CategoryIDs
		}

		// คำนวณ final state จากข้อมูลเดิมใน DB ผสมกับ Request Payload อย่างแน่ชัด
		oldIsPublished := novelPtr.IsPublished
		oldIsCompleted := novelPtr.IsCompleted

		finalIsPublished := oldIsPublished
		if req.IsPublished != nil {
			finalIsPublished = *req.IsPublished
		}

		finalIsCompleted := oldIsCompleted
		if req.IsCompleted != nil {
			finalIsCompleted = *req.IsCompleted
		}

		// ถ้าผู้ใช้ส่ง status string มา ให้ตีความประกอบกรณีไม่ได้ส่ง boolean flags มา
		if req.IsPublished == nil || req.IsCompleted == nil {
			switch strings.TrimSpace(strings.ToLower(req.Status)) {
			case "published":
				if req.IsPublished == nil {
					finalIsPublished = true
				}
			case "completed-published":
				if req.IsPublished == nil {
					finalIsPublished = true
				}
				if req.IsCompleted == nil {
					finalIsCompleted = true
				}
			case "completed-draft", "completed":
				if req.IsCompleted == nil {
					finalIsCompleted = true
				}
			case "draft":
				if req.IsPublished == nil {
					finalIsPublished = false
				}
			}
		}
		if novelPtr.Status == "suspended" && finalIsPublished {
			WriteError(w, http.StatusConflict, "suspended novels must be unbanned before publishing")
			return
		}

		status := deriveNovelStatus(finalIsCompleted, finalIsPublished)

		log.Printf("[DEBUG UpdateNovelHandler] novelID=%d oldIsPublished=%v oldIsCompleted=%v reqStatus=%s reqIsPublished=%v reqIsCompleted=%v finalIsPublished=%v finalIsCompleted=%v finalStatus=%s",
			novelID, oldIsPublished, oldIsCompleted, req.Status, req.IsPublished, req.IsCompleted, finalIsPublished, finalIsCompleted, status)

		updatedNovel := models.Novel{
			ID:           novelID,
			Title:        title,
			Captions:     captions,
			Introduction: introduction,
			CategoryIDs:  categoryIDs,
			CoverImage:   coverImage,
			Status:       status,
			IsPublished:  finalIsPublished,
			IsCompleted:  finalIsCompleted,
		}

		var validationResult *service.PublishValidationResult

		// กรณีที่ 1: กำลัง publish novel ครั้งแรก (draft → published)
		if finalIsPublished && !oldIsPublished {
			log.Printf("[DEBUG UpdateNovelHandler] Entering Case 1: draft -> published for novelID=%d", novelID)
			val := sceneService.ValidateNovelPublishability(novelID)
			validationResult = &val
			if !val.CanPublish {
				log.Printf("[DEBUG UpdateNovelHandler] Case 1 BLOCKED for novelID=%d, issues=%+v", novelID, val.Issues)
				WriteJSON(w, http.StatusBadRequest, map[string]any{
					"error":       "ไม่สามารถเผยแพร่นิยายได้เนื่องจากมีปัญหาโครงสร้าง",
					"can_publish": false,
					"issues":      val.Issues,
				})
				return
			}
		}

		// กรณีที่ 2: final state จะเป็น published+completed → ตรวจ ending scene โดยตรงจาก StoryTree
		// ตรวจจาก FINAL STATE เพื่อป้องกันทุกกรณีที่สถานะสุดท้ายคือ is_published=true + is_completed=true
		// รวมถึงกรณีที่ novel อยู่ใน completed-published อยู่แล้ว และ frontend ส่ง payload ซ้ำ
		if finalIsPublished && finalIsCompleted {
			log.Printf("[DEBUG UpdateNovelHandler] Entering Case 2: final state published+completed for novelID=%d", novelID)
			nodes, err := sceneService.GetStoryTree(novelID, 0)
			hasEnding := false
			if err == nil {
				for _, node := range nodes.Nodes {
					if strings.EqualFold(node.Type, "ending") {
						hasEnding = true
						break
					}
				}
			}
			if !hasEnding {
				issue := service.PublishIssue{
					Severity: "blocking",
					Code:     "COMPLETED_WITHOUT_ENDING",
					Message:  "นิยายถูกตั้งค่าว่าจบแล้ว (is_completed = true) แต่ยังไม่มีฉากจบ (ending scene) ในเรื่อง กรุณาเพิ่มฉากจบอย่างน้อย 1 ฉาก",
				}
				val := service.PublishValidationResult{
					CanPublish: false,
					Issues:     []service.PublishIssue{issue},
				}
				validationResult = &val
				log.Printf("[DEBUG UpdateNovelHandler] Case 2 BLOCKED for novelID=%d: no ending scene", novelID)
				WriteJSON(w, http.StatusBadRequest, map[string]any{
					"error":       "ไม่สามารถตั้งนิยายเป็นจบได้เนื่องจากไม่มีฉากจบ",
					"can_publish": false,
					"issues":      val.Issues,
				})
				return
			}
		}

		if err := novelService.UpdateNovel(updatedNovel); err != nil {
			if errors.Is(err, repository.ErrCategoryNotFound) {
				WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeInternalError(w, err)
			return
		}
		action := novelAuditAction(oldIsPublished, finalIsPublished)
		recordAudit(r, auditService, service.AuditEvent{Action: action, TargetType: "novel", TargetID: int64Pointer(novelID), Status: "SUCCESS", Metadata: novelAuditMetadata(novelPtr, updatedNovel)})

		if updatedNovel.IsPublished && !novelPtr.IsPublished {
			if err := notificationService.NotifyNewNovelPublished(novelID); err != nil {
				log.Printf("NotifyNewNovelPublished failed: %v", err)
			}
		}

		responsePayload := map[string]any{
			"message": "novel updated",
		}
		if validationResult != nil && len(validationResult.Issues) > 0 {
			responsePayload["issues"] = validationResult.Issues
		}

		WriteJSON(w, http.StatusOK, responsePayload)
	}
}

func novelAuditAction(oldPublished, newPublished bool) string {
	if !oldPublished && newPublished {
		return "PUBLISH_NOVEL"
	}
	if oldPublished && !newPublished {
		return "UNPUBLISH_NOVEL"
	}
	return "UPDATE_NOVEL"
}

func novelAuditMetadata(oldNovel *models.Novel, newNovel models.Novel) map[string]interface{} {
	metadata := make(map[string]interface{})
	if oldNovel.Status != newNovel.Status {
		metadata["old_status"] = oldNovel.Status
		metadata["new_status"] = newNovel.Status
	}
	if oldNovel.Title != newNovel.Title {
		metadata["old_title"] = oldNovel.Title
		metadata["new_title"] = newNovel.Title
	}
	if oldNovel.IsCompleted != newNovel.IsCompleted {
		metadata["old_is_completed"] = oldNovel.IsCompleted
		metadata["new_is_completed"] = newNovel.IsCompleted
	}
	return metadata
}

// UnbanNovelHandler allows an admin to unban a novel
func UnbanNovelHandler(novelService service.NovelService, auditService service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		// Ensure admin role
		role, ok := middleware.GetRoleFromContext(r.Context())
		if !ok || role != "admin" {
			WriteError(w, http.StatusForbidden, "Forbidden: admin role required")
			return
		}
		// Extract novel ID from URL path /api/admin/novels/{id}/unban
		novelID, err := extractAdminNovelID(r.URL.Path, "/unban")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		// ดึงข้อมูลนิยายก่อน unban เพื่อนำมาเป็น metadata
		var oldTitle string
		var authorID int
		var oldStatus string
		nov, err := novelService.GetNovelDetail(novelID)
		if err != nil || nov == nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}
		n, ok := nov.(*models.Novel)
		if !ok || n == nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}
		oldTitle = n.Title
		authorID = n.AuthorID
		oldStatus = n.Status
		if oldStatus != "suspended" {
			WriteError(w, http.StatusConflict, "only suspended novels can be unbanned")
			return
		}

		// Perform unban via service
		if err := novelService.UnbanNovel(r.Context(), novelID); err != nil {
			writeInternalError(w, err)
			return
		}

		authorName := strings.TrimSpace(n.PenName)
		if authorName == "" {
			authorName = strings.TrimSpace(n.AuthorName)
		}
		if authorName == "" {
			authorName = fmt.Sprintf("นักเขียน #%d", authorID)
		}
		metadata := map[string]interface{}{
			"novel_id":        novelID,
			"title":           oldTitle,
			"author_id":       authorID,
			"author_name":     authorName,
			"previous_status": oldStatus,
			"new_status":      "draft",
		}
		recordAudit(r, auditService, service.AuditEvent{
			Action:     "UNSUSPEND_NOVEL",
			TargetType: "novel",
			TargetID:   int64Pointer(novelID),
			Status:     "SUCCESS",
			Metadata:   metadata,
		})

		WriteJSON(w, http.StatusOK, map[string]string{"message": "novel unbanned"})
	}
}

func extractNovelIDFromPath(urlPath string) (int, error) {
	path := stripAPIVersionPrefix(urlPath)
	if strings.HasPrefix(path, "/novels/") {
		return extractIDFromPath(path, "/novels/")
	}
	if strings.HasPrefix(urlPath, "/api/v1/writer/novels/") {
		return extractIDFromPath(urlPath, "/api/v1/writer/novels/")
	}
	return 0, errors.New("invalid path")
}

func NovelSubRouteHandler(sceneService service.SceneService, novelService service.NovelService, writerService service.WriterService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		path := strings.TrimPrefix(stripAPIVersionPrefix(r.URL.Path), "/novels/")
		if !strings.HasSuffix(path, "/start") {
			http.NotFound(w, r)
			return
		}

		idStr := strings.TrimSuffix(path, "/start")
		id, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid novel id")
			return
		}

		novelDetail, err := novelService.GetNovelDetail(id)
		if err != nil {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		novelPtr, ok := novelDetail.(*models.Novel)
		if !ok || novelPtr == nil {
			WriteError(w, http.StatusInternalServerError, "failed to load novel details")
			return
		}

		isOwnerOrAdmin := false
		ctxUserID, ok := middleware.GetUserIDFromContext(r.Context())
		if ok && ctxUserID != 0 {
			if role, roleOk := middleware.GetRoleFromContext(r.Context()); roleOk && role == "admin" {
				isOwnerOrAdmin = true
			} else if writerService != nil {
				writer, wErr := writerService.GetWriterByUserID(int(ctxUserID))
				if wErr == nil && writer != nil && writer.WriterID == novelPtr.AuthorID {
					isOwnerOrAdmin = true
				}
			}
		}

		if !isOwnerOrAdmin && !novelPtr.IsPublished {
			WriteError(w, http.StatusNotFound, "novel not found")
			return
		}

		response, err := sceneService.GetStartScene(id)
		if err != nil {
			writeInternalError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, response)
	}
}
