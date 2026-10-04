package handlers

import (
	"errors"
	"strings"
)

type CreateNovelRequest struct {
	Title        string  `json:"title"`
	Captions     *string `json:"captions,omitempty"`
	Introduction *string `json:"introduction,omitempty"`
	CoverImage   *string `json:"cover_image,omitempty"`
	Status       string  `json:"status,omitempty"`
	IsPublished  *bool   `json:"is_published,omitempty"`
	IsCompleted  *bool   `json:"is_completed,omitempty"`
	CategoryIDs  []int   `json:"category_ids,omitempty"`
	AuthorID     int     `json:"author_id"`
}

func normalizeNovelStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "publish", "published":
		return "published"
	case "completed", "complete", "finished":
		return "completed"
	case "completed-published", "completed_published", "completed+published":
		return "completed-published"
	case "completed-draft", "completed_draft", "completed+draft":
		return "completed-draft"
	default:
		return "draft"
	}
}

func deriveNovelStatus(isCompleted, isPublished bool) string {
	switch {
	case isCompleted && isPublished:
		return "completed-published"
	case isCompleted:
		return "completed-draft"
	case isPublished:
		return "published"
	default:
		return "draft"
	}
}

func resolveNovelStatus(status string, isPublished *bool, isCompleted *bool) (string, bool, bool) {
	resolvedPublished := false
	resolvedCompleted := false

	if isPublished != nil {
		resolvedPublished = *isPublished
	}
	if isCompleted != nil {
		resolvedCompleted = *isCompleted
	}

	if isPublished == nil && isCompleted == nil {
		switch normalizeNovelStatus(status) {
		case "published":
			resolvedPublished = true
		case "completed-published":
			resolvedPublished = true
			resolvedCompleted = true
		case "completed-draft", "completed":
			resolvedCompleted = true
		}
	}

	return deriveNovelStatus(resolvedCompleted, resolvedPublished), resolvedPublished, resolvedCompleted
}

func (r *CreateNovelRequest) Validate() error {
	if strings.TrimSpace(r.Title) == "" {
		return errors.New("title is required")
	}
	resolvedStatus, _, _ := resolveNovelStatus(r.Status, r.IsPublished, r.IsCompleted)
	r.Status = resolvedStatus
	return nil
}

type UpdateNovelRequest struct {
	Title        string  `json:"title,omitempty"`
	Captions     *string `json:"captions,omitempty"`
	Introduction *string `json:"introduction,omitempty"`
	CoverImage   *string `json:"cover_image,omitempty"`
	CategoryIDs  []int   `json:"category_ids,omitempty"`
	Status       string  `json:"status,omitempty"`
	IsPublished  *bool   `json:"is_published,omitempty"`
	IsCompleted  *bool   `json:"is_completed,omitempty"`
}

func (r *UpdateNovelRequest) Validate() error {
	// At least one updatable field must be present
	if strings.TrimSpace(r.Title) == "" && strings.TrimSpace(r.Status) == "" && r.Captions == nil && r.Introduction == nil && r.CoverImage == nil && len(r.CategoryIDs) == 0 && r.IsPublished == nil && r.IsCompleted == nil {
		return errors.New("at least one field is required")
	}
	return nil
}
