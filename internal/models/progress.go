package models

import "time"

type ReadingProgress struct {
	ProgressID     int        `json:"progress_id"`
	UserID         int        `json:"user_id"`
	NovelID        int        `json:"novel_id"`
	CurrentSceneID int        `json:"current_scene_id"`
	UpdatedAt      *time.Time `json:"updated_at,omitempty"`
}

type ChoiceHistory struct {
	ID         int       `json:"id"`
	UserID     int       `json:"user_id"`
	ChoiceID   int       `json:"choice_id"`
	SelectedAt time.Time `json:"selected_at"`
}
