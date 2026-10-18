package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/service"
	"strings"
)

func writerSubRouter(writer service.WriterService, social service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/api/v1/writers/") {
			path = strings.TrimPrefix(path, "/api/v1/writers/")
		} else if strings.HasPrefix(path, "/api/v1/writer/") {
			path = strings.TrimPrefix(path, "/api/v1/writer/")
		} else {
			path = strings.TrimPrefix(path, "/writer/")
		}
		path = strings.TrimSuffix(path, "/")
		switch {
		case r.Method == http.MethodGet && isNumericIDPath(path):
			handlers.GetWriterDetailHandler(writer)(w, r)
			return
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/bookshelf-counts"):
			handlers.GetWriterBookshelfCountsHandler(social)(w, r)
			return
		case r.Method == http.MethodGet && strings.HasSuffix(path, "/total-views"):
			handlers.GetWriterTotalViewsHandler(writer)(w, r)
			return
		default:
			http.NotFound(w, r)
		}
	}
}
