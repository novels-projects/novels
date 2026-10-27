package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRecordUnauthorizedUsesContextThatSurvivesRequestCancellation(t *testing.T) {
	previousRecorder := unauthorizedRecorder
	t.Cleanup(func() {
		unauthorizedRecorder = previousRecorder
	})

	result := make(chan error, 1)
	SetUnauthorizedRecorder(func(r *http.Request, _, _ string, _ uint, _ bool) {
		result <- r.Context().Err()
	})

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/api/v1/users/me", nil).WithContext(ctx)
	cancel()

	recordUnauthorized(req, "missing_token", "")

	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("audit recorder received canceled context: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("audit recorder was not called")
	}
}
