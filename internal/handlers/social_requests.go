package handlers

import (
	"errors"
	"strings"
)

type LikeRequest struct {
	UserID  int `json:"user_id"`
	NovelID int `json:"novel_id"`
}

func (r *LikeRequest) Validate() error {
	if r.UserID == 0 {
		return errors.New("user_id is required")
	}
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	return nil
}

type BookshelfRequest struct {
	UserID  int `json:"user_id"`
	NovelID int `json:"novel_id"`
}

func (r *BookshelfRequest) Validate() error {
	if r.UserID == 0 {
		return errors.New("user_id is required")
	}
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	return nil
}

type CommentRequest struct {
	UserID  int    `json:"user_id"`
	NovelID int    `json:"novel_id"`
	SceneID *int   `json:"scene_id,omitempty"`
	Content string `json:"content"`
}

func (r *CommentRequest) Validate() error {
	if r.UserID == 0 {
		return errors.New("user_id is required")
	}
	if r.NovelID == 0 {
		return errors.New("novel_id is required")
	}
	if strings.TrimSpace(r.Content) == "" {
		return errors.New("content is required")
	}
	return nil
}

type FollowRequest struct {
	FollowerID  int `json:"follower_id"`
	FollowingID int `json:"following_id"`
}

func (r *FollowRequest) Validate() error {
	if r.FollowerID == 0 {
		return errors.New("follower_id is required")
	}
	if r.FollowingID == 0 {
		return errors.New("following_id is required")
	}
	return nil
}
