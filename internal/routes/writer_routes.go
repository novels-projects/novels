package routes

import (
	"net/http"
	"novel-be/internal/handlers"
	"novel-be/internal/service"
	"strings"
)

func writerSubRouter(writer service.WriterService, social service.SocialService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/writer/"), "/")
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
