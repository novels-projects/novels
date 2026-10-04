package dto

import (
	"time"

	"novel-be/internal/models"
)

// Common response wrappers
type SuccessResponse struct {
	Status  int         `json:"status"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type AdminNovelListResponse struct {
	Novels []models.Novel `json:"novels"`
	Page   int            `json:"page"`
	Limit  int            `json:"limit"`
	Total  int            `json:"total"`
}

// Comment Response DTOs
type CommentDetailDTO struct {
	CommentID int    `json:"comment_id"`
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	NovelID   int    `json:"novel_id"`
	SceneID   *int   `json:"scene_id,omitempty"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

type RestartStoryResponseDTO struct {
	NovelID      int `json:"novel_id"`
	StartSceneID int `json:"start_scene_id"`
}

type AdminWriterDetailsDTO struct {
	ID               uint     `json:"id"`
	WriterID         uint     `json:"writer_id"`
	NameLastname     string   `json:"name_lastname"`
	PenName          string   `json:"pen_name"`
	Bio              string   `json:"bio"`
	Genres           []string `json:"genres"`
	PrimaryContact   string   `json:"primary_contact"`
	SecondaryContact string   `json:"secondary_contact"`
}

type AdminUserListItemDTO struct {
	ID                      uint                   `json:"id"`
	Username                string                 `json:"username"`
	Email                   string                 `json:"email"`
	PicProfile              *string                `json:"pic_profile,omitempty"`
	Role                    string                 `json:"role"`
	Status                  string                 `json:"status"`
	CreatedAt               string                 `json:"created_at"`
	SuspendedReason         *string                `json:"suspended_reason,omitempty"`
	SuspendedAt             *time.Time             `json:"suspended_at,omitempty"`
	WriterApplicationStatus *string                `json:"writer_application_status,omitempty"`
	HasWriterHistory        bool                   `json:"had_writer_history"`
	WriterID                *uint                  `json:"writer_id,omitempty"`
	WriterDetails           *AdminWriterDetailsDTO `json:"writer_details,omitempty"`
}

type AdminUserDetailDTO struct {
	ID                      uint                   `json:"id"`
	Username                string                 `json:"username"`
	Email                   string                 `json:"email"`
	PicProfile              *string                `json:"pic_profile,omitempty"`
	Role                    string                 `json:"role"`
	Status                  string                 `json:"status"`
	CreatedAt               string                 `json:"created_at"`
	SuspendedReason         *string                `json:"suspended_reason,omitempty"`
	SuspendedAt             *time.Time             `json:"suspended_at,omitempty"`
	WriterApplicationStatus *string                `json:"writer_application_status,omitempty"`
	HasWriterHistory        bool                   `json:"had_writer_history"`
	WriterID                *uint                  `json:"writer_id,omitempty"`
	WriterDetails           *AdminWriterDetailsDTO `json:"writer_details,omitempty"`
}

type AdminUserListResponseDTO struct {
	Users []AdminUserListItemDTO `json:"users"`
}
