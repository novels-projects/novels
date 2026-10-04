package handlers

import (
	"errors"
	"strings"
)

type CreateSceneRequest struct {
	NovelID           int           `json:"novel_id"`
	ChapterID         int           `json:"chapter_id"`
	Title             string        `json:"title"`
	Content           string        `json:"content"`
	ImageURL          string        `json:"image_url"`
	Type              string        `json:"type"`
	Status            string        `json:"status"`
	EndingTitle       string        `json:"ending_title"`
	EndingType        string        `json:"ending_type"`
	EndingDescription string        `json:"ending_description"`
	Choices           []interface{} `json:"choices,omitempty"`
}

func (r *CreateSceneRequest) Validate() error {
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	if r.ChapterID == 0 {
		return errors.New("chapter_id is required")
	}
	if strings.TrimSpace(r.Title) == "" {
		return errors.New("title is required")
	}
	if strings.TrimSpace(r.Type) == "" {
		r.Type = "normal"
	}
	if strings.TrimSpace(r.Status) == "" {
		r.Status = "draft"
	}
	return nil
}

type UpdateSceneRequest struct {
	Title             string        `json:"title"`
	Content           string        `json:"content"`
	Type              string        `json:"type"`
	IsEnding          bool          `json:"is_ending"`
	EndingTitle       string        `json:"ending_title"`
	EndingType        string        `json:"ending_type"`
	EndingDescription string        `json:"ending_description"`
	Status            string        `json:"status"`
	Choices           []interface{} `json:"choices,omitempty"`
}

func (r *UpdateSceneRequest) Validate() error {
	return nil
}

type UpdateScenePositionRequest struct {
	NodeX *float64 `json:"node_x"`
	NodeY *float64 `json:"node_y"`
}

func (r *UpdateScenePositionRequest) Validate() error {
	return nil
}
