package routes

import (
	"strconv"
	"strings"
)

func isNumericIDPath(path string) bool {
	path = strings.Trim(path, "/")
	if path == "" || strings.Contains(path, "/") {
		return false
	}
	_, err := strconv.Atoi(path)
	return err == nil
}
