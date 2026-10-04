package handlers

import (
	"errors"
	"strings"
)

type CreateChoiceRequest struct {
	FromSceneID int    `json:"from_scene_id"`
	ToSceneID   int    `json:"to_scene_id"`
	Label       string `json:"label"`
}

func (r *CreateChoiceRequest) Validate() error {
	if r.FromSceneID == 0 {
		return errors.New("from_scene_id is required")
	}
	if r.ToSceneID == 0 {
		return errors.New("to_scene_id is required")
	}
	if strings.TrimSpace(r.Label) == "" {
		return errors.New("label is required")
	}
	return nil
}

type UpdateChoiceRequest struct {
	Label     string `json:"label"`
	ToSceneID int    `json:"to_scene_id"`
}

func (r *UpdateChoiceRequest) Validate() error {
	if strings.TrimSpace(r.Label) == "" {
		return errors.New("label is required")
	}
	if r.ToSceneID == 0 {
		return errors.New("to_scene_id is required")
	}
	return nil
}
