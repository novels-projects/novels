package dto

type AdminNovelModerationRequest struct {
	Action string `json:"action"`
	Reason string `json:"reason"`
}
