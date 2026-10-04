package handlers

import (
	"errors"
	"strings"
)

type CreateChapterRequest struct {
	NovelID int    `json:"novel_id"`
	Episode int    `json:"episode"`
	Title   string `json:"title"`
	Status  string `json:"status,omitempty"`
}

func (r *CreateChapterRequest) Validate() error {
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	if r.Episode == 0 {
		return errors.New("episode is required")
	}
	if strings.TrimSpace(r.Title) == "" {
		return errors.New("title is required")
	}
	if strings.TrimSpace(r.Status) == "" {
		r.Status = "draft"
	}
	return nil
}

type UpdateChapterRequest struct {
	Title  string `json:"title,omitempty"`
	Status string `json:"status,omitempty"`
}

func (r *UpdateChapterRequest) Validate() error {
	if strings.TrimSpace(r.Title) == "" && strings.TrimSpace(r.Status) == "" {
		return errors.New("title or status is required")
	}
	return nil
}
