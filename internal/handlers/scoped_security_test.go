package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
)

func requestWithUser(method, path string, body any, userID uint) *http.Request {
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	return req.WithContext(ctx)
}

func TestProgressHandlersUseJWTUserID(t *testing.T) {
	reading := &mockReadingService{progress: &models.ReadingProgress{UserID: 42, NovelID: 7, CurrentSceneID: 9}}
	get := GetProgressHandler(reading)
	getResponse := httptest.NewRecorder()
	getReq := requestWithUser(http.MethodGet, "/progress?user_id=99&novel_id=7", nil, 42)
	get(getResponse, getReq)

	if getResponse.Code != http.StatusOK || reading.progressUser != 42 {
		t.Fatalf("expected progress lookup for JWT user 42, status=%d user=%d", getResponse.Code, reading.progressUser)
	}

	reset := ResetProgressHandler(reading)
	resetResponse := httptest.NewRecorder()
	resetReq := requestWithUser(http.MethodDelete, "/progress?user_id=99&novel_id=7", nil, 42)
	reset(resetResponse, resetReq)
	if resetResponse.Code != http.StatusOK || reading.resetUser != 42 {
		t.Fatalf("expected progress reset for JWT user 42, status=%d user=%d", resetResponse.Code, reading.resetUser)
	}
}

func TestChoiceHistoryUsesJWTUserID(t *testing.T) {
	reading := &mockReadingService{}
	scene := &mockSceneService{
		choice: &models.Choice{ChoiceID: 5, FromSceneID: 8, ToSceneID: 9},
		scene:  models.SceneResponse{SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		scenes: map[int]models.SceneResponse{
			8: {SceneID: 8, NovelID: 7, ChapterID: 11, Status: "published"},
			9: {SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		},
	}
	reading.progress = &models.ReadingProgress{UserID: 42, NovelID: 7, CurrentSceneID: 8}
	novel := &mockNovelService{novel: models.Novel{ID: 7, IsPublished: true}}
	chapter := &mockChapterService{chapter: &models.Chapter{ChapterID: 11, NovelID: 7, Status: "published"}}
	handler := RecordChoiceHistoryHandler(reading, scene, novel, &mockWriterService{}, chapter)
	response := httptest.NewRecorder()
	req := requestWithUser(http.MethodPost, "/choice-history", map[string]int{"user_id": 99, "choice_id": 5}, 42)
	handler(response, req)

	if response.Code != http.StatusCreated || reading.choiceHistory == nil || reading.choiceHistory.UserID != 42 {
		t.Fatalf("expected choice history for JWT user 42, status=%d history=%+v", response.Code, reading.choiceHistory)
	}
}

func TestChoiceHistoryCanStartFromStartSceneBeforeInitialProgressSave(t *testing.T) {
	reading := &mockReadingService{}
	scene := &mockSceneService{
		choice:     &models.Choice{ChoiceID: 5, FromSceneID: 8, ToSceneID: 9},
		scene:      models.SceneResponse{SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		startScene: models.SceneResponse{SceneID: 8, NovelID: 7, ChapterID: 11, Type: "start", Status: "published"},
		scenes: map[int]models.SceneResponse{
			8: {SceneID: 8, NovelID: 7, ChapterID: 11, Type: "start", Status: "published"},
			9: {SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		},
	}
	novel := &mockNovelService{novel: models.Novel{ID: 7, IsPublished: true}}
	chapter := &mockChapterService{chapter: &models.Chapter{ChapterID: 11, NovelID: 7, Status: "published"}}
	handler := RecordChoiceHistoryHandler(reading, scene, novel, &mockWriterService{}, chapter)
	response := httptest.NewRecorder()
	request := requestWithUser(http.MethodPost, "/choice-history", map[string]int{"user_id": 42, "choice_id": 5}, 42)
	handler(response, request)

	if response.Code != http.StatusCreated || reading.choiceHistory == nil {
		t.Fatalf("expected initial start-scene choice to be recorded, status=%d history=%+v", response.Code, reading.choiceHistory)
	}
}

func TestChoiceHistoryRejectsChoiceFromNonCurrentScene(t *testing.T) {
	reading := &mockReadingService{progress: &models.ReadingProgress{UserID: 42, NovelID: 7, CurrentSceneID: 6}}
	scene := &mockSceneService{
		choice: &models.Choice{ChoiceID: 5, FromSceneID: 8, ToSceneID: 9},
		scene:  models.SceneResponse{SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		scenes: map[int]models.SceneResponse{
			8: {SceneID: 8, NovelID: 7, ChapterID: 11, Status: "published"},
			9: {SceneID: 9, NovelID: 7, ChapterID: 11, Status: "published"},
		},
	}
	novel := &mockNovelService{novel: models.Novel{ID: 7, IsPublished: true}}
	chapter := &mockChapterService{chapter: &models.Chapter{ChapterID: 11, NovelID: 7, Status: "published"}}
	handler := RecordChoiceHistoryHandler(reading, scene, novel, &mockWriterService{}, chapter)
	response := httptest.NewRecorder()
	request := requestWithUser(http.MethodPost, "/choice-history", map[string]int{"user_id": 42, "choice_id": 5}, 42)
	handler(response, request)

	if response.Code != http.StatusForbidden || reading.choiceHistory != nil {
		t.Fatalf("expected non-current choice to be rejected, status=%d history=%+v", response.Code, reading.choiceHistory)
	}
}

func TestProgressRejectsInvalidTransitionAndKeepsWriterPreviewReadOnly(t *testing.T) {
	novel := &mockNovelService{novel: models.Novel{ID: 7, IsPublished: true}}
	scene := &mockSceneService{scene: models.SceneResponse{SceneID: 9, NovelID: 7, ChapterID: 11, Type: "ending", Status: "published"}}
	chapter := &mockChapterService{chapter: &models.Chapter{ChapterID: 11, NovelID: 7, Status: "published"}}
	reading := &mockReadingService{saveProgressErr: repository.ErrReadingProgressTransitionInvalid}
	handler := SaveProgressHandler(reading, novel, &mockWriterService{}, scene, chapter)
	response := httptest.NewRecorder()
	request := requestWithUser(http.MethodPost, "/progress", map[string]int{
		"user_id": 42, "novel_id": 7, "current_scene_id": 9,
	}, 42)
	handler(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected invalid progress transition to return 403, got %d", response.Code)
	}

	previewReading := &mockReadingService{}
	previewNovel := &mockNovelService{novel: models.Novel{ID: 7, AuthorID: 12}}
	previewWriter := &mockWriterService{writer: &models.Writer{WriterID: 12, UserID: 42}}
	previewHandler := SaveProgressHandler(previewReading, previewNovel, previewWriter, nil, nil)
	previewResponse := httptest.NewRecorder()
	previewRequest := requestWithUser(http.MethodPost, "/progress?preview=true", map[string]int{
		"user_id": 42, "novel_id": 7, "current_scene_id": 9,
	}, 42)
	previewHandler(previewResponse, previewRequest)
	if previewResponse.Code != http.StatusCreated || previewReading.savedProgress != nil {
		t.Fatalf("writer preview should remain read-only, status=%d saved=%+v", previewResponse.Code, previewReading.savedProgress)
	}
}

func TestEndingRecordingRequiresCurrentPublishedEnding(t *testing.T) {
	tests := []struct {
		name     string
		progress *models.ReadingProgress
		status   string
		wantCode int
	}{
		{"not reached", &models.ReadingProgress{CurrentSceneID: 8}, "published", http.StatusForbidden},
		{"unpublished", &models.ReadingProgress{CurrentSceneID: 9}, "draft", http.StatusNotFound},
		{"reached and unlocked", &models.ReadingProgress{CurrentSceneID: 9}, "published", http.StatusCreated},
		{"current but not unlocked", &models.ReadingProgress{CurrentSceneID: 9}, "published", http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reading := &mockReadingService{progress: tt.progress}
			scene := &mockSceneService{scene: models.SceneResponse{SceneID: 9, NovelID: 7, Type: "ending", Status: tt.status}}
			if tt.name == "reached and unlocked" {
				scene.endings = []models.EndingScene{{SceneID: 9, IsUnlocked: true}}
			}
			novel := &mockNovelService{novel: models.Novel{ID: 7, IsPublished: true}}
			handler := RecordUserEndingHandler(reading, scene, novel, &mockWriterService{})
			response := httptest.NewRecorder()
			req := requestWithUser(http.MethodPost, "/user-endings", map[string]int{"user_id": 99, "novel_id": 7, "scene_id": 9}, 42)
			handler(response, req)

			if response.Code != tt.wantCode {
				t.Fatalf("expected status %d, got %d", tt.wantCode, response.Code)
			}
			if reading.recordEndingCalled {
				t.Fatal("ending confirmation must not create an unlock")
			}
		})
	}
}

func TestCreateNovelAllowsInitialPublishedStateWithoutSceneValidation(t *testing.T) {
	novel := &mockNovelService{}
	scene := &mockSceneService{}
	writer := &mockWriterService{writer: &models.Writer{WriterID: 10, UserID: 42}}
	handler := NovelsHandler(novel, scene, writer, nil, nil)
	response := httptest.NewRecorder()
	req := requestWithUser(http.MethodPost, "/novels", map[string]any{"title": "Published on create", "status": "published"}, 42)
	handler(response, req)

	if response.Code != http.StatusCreated || novel.createdNovel == nil || !novel.createdNovel.IsPublished || novel.updatedNovel != nil {
		t.Fatalf("expected create-time published novel to be accepted without scene validation, status=%d created=%+v updated=%+v", response.Code, novel.createdNovel, novel.updatedNovel)
	}
}

func TestReorderRequiresOwnerAndSameNovel(t *testing.T) {
	chapter := &mockChapterService{chapters: map[int]*models.Chapter{
		1: {ChapterID: 1, NovelID: 7},
		2: {ChapterID: 2, NovelID: 8},
	}}
	novel := &mockNovelService{novel: models.Novel{ID: 7, AuthorID: 10}}
	writer := &mockWriterService{writer: &models.Writer{WriterID: 10, UserID: 42}}
	handler := ReorderChaptersHandler(chapter, novel, writer)

	tests := []struct {
		name     string
		userID   uint
		role     string
		order    []int
		wantCode int
	}{
		{"owner", 42, "", []int{1}, http.StatusOK},
		{"admin", 99, "admin", []int{1}, http.StatusOK},
		{"non-owner", 99, "", []int{1}, http.StatusForbidden},
		{"cross-novel", 42, "", []int{1, 2}, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			req := requestWithUser(http.MethodPut, "/novels/7/chapters/reorder", map[string]any{"order": tt.order}, tt.userID)
			ctx := context.WithValue(req.Context(), middleware.RoleKey, tt.role)
			req = req.WithContext(ctx)
			handler(response, req)
			if response.Code != tt.wantCode {
				t.Fatalf("expected status %d, got %d", tt.wantCode, response.Code)
			}
		})
	}
}

type selfFollowSocialService struct{}

func (selfFollowSocialService) AddLike(models.Like) error                        { return nil }
func (selfFollowSocialService) RemoveLike(int, int) error                        { return nil }
func (selfFollowSocialService) IsLikeExists(int, int) (bool, error)              { return false, nil }
func (selfFollowSocialService) AddToBookshelf(int, int) error                    { return nil }
func (selfFollowSocialService) RemoveFromBookshelf(int, int) error               { return nil }
func (selfFollowSocialService) GetBookshelfByUserID(int) ([]models.Novel, error) { return nil, nil }
func (selfFollowSocialService) GetBookshelfCountByNovelID(int) (int, error)      { return 0, nil }
func (selfFollowSocialService) GetBookshelfCountsByAuthorID(int) ([]models.Novel, error) {
	return nil, nil
}
func (selfFollowSocialService) AddComment(models.Comment) (int, error)           { return 0, nil }
func (selfFollowSocialService) RemoveComment(int, int) error                     { return nil }
func (selfFollowSocialService) AddFollow(models.Follow) error                    { return repository.ErrSelfFollow }
func (selfFollowSocialService) RemoveFollow(int, int) error                      { return nil }
func (selfFollowSocialService) GetFollowingWriters(int) ([]models.Writer, error) { return nil, nil }
func (selfFollowSocialService) GetCommentCountByNovelID(int) (int, error)        { return 0, nil }
func (selfFollowSocialService) GetCommentsByNovelID(int) ([]dto.CommentDetailDTO, error) {
	return nil, nil
}
func (selfFollowSocialService) GetCommentsBySceneID(int) ([]dto.CommentDetailDTO, error) {
	return nil, nil
}

func TestFollowWriterRejectsSelfFollow(t *testing.T) {
	handler := FollowWriterHandler(selfFollowSocialService{}, nil)
	response := httptest.NewRecorder()
	req := requestWithUser(http.MethodPost, "/api/writers/7/follow", nil, 42)
	handler(response, req)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected self-follow to be rejected with 400, got %d", response.Code)
	}
}

func TestCreateNovelAllowsDraftState(t *testing.T) {
	novel := &mockNovelService{}
	writer := &mockWriterService{writer: &models.Writer{WriterID: 10, UserID: 42}}
	handler := NovelsHandler(novel, nil, writer, nil, nil)
	response := httptest.NewRecorder()
	req := requestWithUser(http.MethodPost, "/novels", map[string]any{"title": "Draft novel"}, 42)
	handler(response, req)

	if response.Code != http.StatusCreated || novel.createdNovel == nil || novel.createdNovel.IsPublished {
		t.Fatalf("expected draft creation to remain allowed, status=%d created=%+v", response.Code, novel.createdNovel)
	}
}
