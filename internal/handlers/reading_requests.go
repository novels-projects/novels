package handlers

import (
	"errors"
)

type SaveProgressRequest struct {
	UserID         int `json:"user_id"`
	NovelID        int `json:"novel_id"`
	CurrentSceneID int `json:"current_scene_id"`
}

func (r *SaveProgressRequest) Validate() error {
	if r.UserID == 0 {
		return errors.New("user_id is required")
	}
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	if r.CurrentSceneID == 0 {
		return errors.New("current_scene_id is required")
	}
	return nil
}

type RecordChoiceHistoryRequest struct {
	UserID   int `json:"user_id"`
	ChoiceID int `json:"choice_id"`
}

func (r *RecordChoiceHistoryRequest) Validate() error {
	if r.UserID == 0 {
		return errors.New("user_id is required")
	}
	if r.ChoiceID == 0 {
		return errors.New("choice_id is required")
	}
	return nil
}
