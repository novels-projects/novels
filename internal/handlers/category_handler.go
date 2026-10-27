package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"novel-be/internal/service"
)

// GetAllCategoriesHandler ปรับให้รับ Service แล้ว return http.HandlerFunc
func GetAllCategoriesHandler(s service.CategoryService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		categories, err := s.GetCategories()
		if err != nil {
			respondInternal(w, "failed to fetch categories", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, categories)
	}
}

type CategoryRequest struct {
	Name string `json:"name"`
}

func AdminCreateCategoryHandler(s service.CategoryService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			RespondWithError(w, http.StatusMethodNotAllowed, "Method not allowed", "method not allowed")
			return
		}

		var req CategoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			RespondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
			return
		}

		c, err := s.CreateCategory(r.Context(), req.Name)
		if err != nil {
			if errors.Is(err, service.ErrInvalidCategoryName) {
				RespondWithError(w, http.StatusBadRequest, "Category name cannot be empty", err.Error())
				return
			}
			if errors.Is(err, service.ErrCategoryDuplicate) {
				RespondWithError(w, http.StatusConflict, "Category name already exists", err.Error())
				return
			}
			respondInternal(w, "Failed to create category", err)
			return
		}

		RespondWithJSON(w, http.StatusCreated, c)
		recordAudit(r, audit, service.AuditEvent{Action: "CREATE_CATEGORY", TargetType: "category", TargetID: int64Pointer(c.CategoryID), Status: "SUCCESS", Metadata: map[string]interface{}{"name": c.Name}})
	}
}

func AdminUpdateCategoryHandler(s service.CategoryService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			RespondWithError(w, http.StatusMethodNotAllowed, "Method not allowed", "method not allowed")
			return
		}

		id, err := extractAdminIDFromPath(r.URL.Path, "categories", "")
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "Invalid category ID", "invalid category_id")
			return
		}

		var req CategoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			RespondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
			return
		}

		old, err := s.GetCategory(r.Context(), id)
		if err != nil {
			if errors.Is(err, service.ErrCategoryNotFound) {
				RespondWithError(w, http.StatusNotFound, "Category not found", err.Error())
				return
			}
			respondInternal(w, "Failed to read category snapshot", err)
			return
		}
		if old == nil {
			RespondWithError(w, http.StatusNotFound, "Category not found", "category not found")
			return
		}
		c, err := s.UpdateCategory(r.Context(), id, req.Name)
		if err != nil {
			if errors.Is(err, service.ErrInvalidCategoryName) {
				RespondWithError(w, http.StatusBadRequest, "Category name cannot be empty", err.Error())
				return
			}
			if errors.Is(err, service.ErrCategoryNotFound) {
				RespondWithError(w, http.StatusNotFound, "Category not found", err.Error())
				return
			}
			if errors.Is(err, service.ErrCategoryDuplicate) {
				RespondWithError(w, http.StatusConflict, "Category name already exists", err.Error())
				return
			}
			respondInternal(w, "Failed to update category", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, c)
		metadata := map[string]interface{}{"new_name": c.Name}
		metadata["old_name"] = old.Name
		recordAudit(r, audit, service.AuditEvent{Action: "UPDATE_CATEGORY", TargetType: "category", TargetID: int64Pointer(id), Status: "SUCCESS", Metadata: metadata})
	}
}

func AdminDeleteCategoryHandler(s service.CategoryService, audit service.AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			RespondWithError(w, http.StatusMethodNotAllowed, "Method not allowed", "method not allowed")
			return
		}

		id, err := extractAdminIDFromPath(r.URL.Path, "categories", "")
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "Invalid category ID", "invalid category_id")
			return
		}

		old, err := s.GetCategory(r.Context(), id)
		if err != nil {
			if errors.Is(err, service.ErrCategoryNotFound) {
				RespondWithError(w, http.StatusNotFound, "Category not found", err.Error())
				return
			}
			respondInternal(w, "Failed to read category snapshot", err)
			return
		}
		if old == nil {
			RespondWithError(w, http.StatusNotFound, "Category not found", "category not found")
			return
		}
		err = s.DeleteCategory(r.Context(), id)
		if err != nil {
			if errors.Is(err, service.ErrCategoryNotFound) {
				RespondWithError(w, http.StatusNotFound, "Category not found", err.Error())
				return
			}
			if errors.Is(err, service.ErrCategoryInUse) {
				RespondWithError(w, http.StatusConflict, "Category is still in use", err.Error())
				return
			}
			respondInternal(w, "Failed to delete category", err)
			return
		}

		RespondWithJSON(w, http.StatusOK, map[string]string{
			"message": "ลบหมวดหมู่สำเร็จแล้ว",
		})
		metadata := map[string]interface{}{"name": old.Name}
		recordAudit(r, audit, service.AuditEvent{Action: "DELETE_CATEGORY", TargetType: "category", TargetID: int64Pointer(id), Status: "SUCCESS", Metadata: metadata})
	}
}
