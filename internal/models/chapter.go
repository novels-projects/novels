package models

import "time"

type Chapter struct {
	ChapterID int       `json:"chapter_id"`
	NovelID   int       `json:"novel_id"`
	Episode   int       `json:"episode"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Scenes    []Scene   `json:"scenes,omitempty"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}
