package handlers

import (
	"errors"
	"strconv"
	"strings"
)

func extractIDFromPath(urlPath, prefix string) (int, error) {
	if !strings.HasPrefix(prefix, "/api/") {
		urlPath = stripAPIVersionPrefix(urlPath)
	}

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

func stripAPIVersionPrefix(path string) string {
	if strings.HasPrefix(path, "/api/v1/") {
		return strings.TrimPrefix(path, "/api/v1")
	}
	return path
}

func extractAdminIDFromPath(urlPath, resource, suffix string) (int, error) {
	path := stripAPIVersionPrefix(urlPath)
	prefix := "/api/admin/" + resource + "/"
	if !strings.HasPrefix(path, prefix) {
		prefix = "/admin/" + resource + "/"
		if !strings.HasPrefix(path, prefix) {
			return 0, errors.New("invalid path")
		}
	}
	path = strings.TrimPrefix(path, prefix)
	if suffix != "" {
		if !strings.HasSuffix(path, suffix) {
			return 0, errors.New("invalid path")
		}
		path = strings.TrimSuffix(path, suffix)
	}
	path = strings.Trim(path, "/")
	if strings.Contains(path, "/") {
		return 0, errors.New("invalid path")
	}
	id, err := strconv.Atoi(path)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}
