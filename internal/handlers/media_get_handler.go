package handlers

import (
	"net/http"
	"novel-be/internal/service"
	"strconv"
)

// POST /upload - Upload image to MinIO and Update Database
func UploadImageHandler(mediaService service.MediaService, novelService service.NovelService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			RespondWithError(w, http.StatusMethodNotAllowed, "method not allowed", "only POST is supported")
			return
		}

		if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
			RespondWithError(w, http.StatusBadRequest, "failed to parse form", err.Error())
			return
		}

		file, handler, err := r.FormFile("image")
		if err != nil {
			RespondWithError(w, http.StatusBadRequest, "missing image file", err.Error())
			return
		}
		defer file.Close()

		url, err := mediaService.UploadImage(r.Context(), handler)
		if err != nil {
			RespondWithError(w, http.StatusInternalServerError, "failed to upload image", err.Error())
			return
		}

		dbPathToSave := url

		novelIDStr := r.FormValue("novel_id")
		var dbStatus string = "not updated"

		if novelIDStr != "" {
			novelID, err := strconv.Atoi(novelIDStr)
			if err == nil && novelID > 0 {
				err = novelService.UpdateNovelCover(novelID, dbPathToSave)
				if err != nil {
					dbStatus = "failed to update database: " + err.Error()
				} else {
					dbStatus = "successfully updated database"
				}
			}
		}

		RespondWithCreated(w, "process completed", map[string]interface{}{
			"full_url":   url,
			"saved_path": dbPathToSave,
			"filename":   handler.Filename,
			"db_status":  dbStatus,
		})
	}
}
