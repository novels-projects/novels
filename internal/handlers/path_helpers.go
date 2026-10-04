package handlers

import (
	"errors"
	"strconv"
	"strings"
)

func extractIDFromPath(urlPath, prefix string) (int, error) {
	// ตัด query string ออกก่อน เช่น /novels/1/start?user_id=1 → /novels/1/start
	if idx := strings.Index(urlPath, "?"); idx != -1 {
		urlPath = urlPath[:idx]
	}

	trimmed := strings.TrimPrefix(urlPath, prefix)
	trimmed = strings.Trim(trimmed, "/")
	if trimmed == "" {
		return 0, errors.New("missing id")
	}
	if idx := strings.Index(trimmed, "/"); idx != -1 {
		trimmed = trimmed[:idx]
	}
	id, err := strconv.Atoi(trimmed)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}
