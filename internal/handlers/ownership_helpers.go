package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/service"
)

var (
	errOwnershipUnauthorized = errors.New("unauthorized")
	errOwnershipForbidden    = errors.New("forbidden")
)

func requireWriterOwnsNovel(ctx context.Context, writerService service.WriterService, novelService service.NovelService, novelID int) error {
	userID, ok := middleware.GetUserIDFromContext(ctx)
	if !ok || userID == 0 {
		return errOwnershipUnauthorized
	}

	writer, err := writerService.GetWriterByUserID(int(userID))
	if err != nil || writer == nil {
		return errOwnershipForbidden
	}

	novelDetail, err := novelService.GetNovelDetail(novelID)
	if err != nil {
		return fmt.Errorf("load novel ownership: %w", err)
	}
	novel, ok := novelDetail.(*models.Novel)
	if !ok || novel == nil {
		return errors.New("failed to load novel details")
	}
	if novel.AuthorID != writer.WriterID {
		return errOwnershipForbidden
	}
	return nil
}

func writeOwnershipError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, errOwnershipUnauthorized):
		WriteError(w, http.StatusUnauthorized, "unauthorized")
	case errors.Is(err, errOwnershipForbidden):
		WriteError(w, http.StatusForbidden, "forbidden")
	default:
		return false
	}
	return true
}
