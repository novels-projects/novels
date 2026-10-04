package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"novel-be/internal/dto"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

type mockNovelService struct {
	novel        models.Novel
	createdNovel *models.Novel
	updatedNovel *models.Novel
}

func (m *mockNovelService) ListNovels() ([]models.Novel, error) { return nil, nil }
func (m *mockNovelService) ListAdminNovels(context.Context, string, string, int, int, int) ([]models.Novel, int, error) {
	return nil, 0, nil
}
func (m *mockNovelService) GetNovelDetail(int) (interface{}, error) { return &m.novel, nil }
func (m *mockNovelService) IncrementViews(int) error                { return nil }
func (m *mockNovelService) GetNovelsByAuthorID(int) ([]models.Novel, error) {
	return nil, nil
}
func (m *mockNovelService) CreateNovel(novel models.Novel) (int, error) {
	m.createdNovel = &novel
	return 0, nil
}
func (m *mockNovelService) UpdateNovel(novel models.Novel) error {
	m.updatedNovel = &novel
	return nil
}
func (m *mockNovelService) UpdateNovelCover(int, string) error      { return nil }
func (m *mockNovelService) DeleteNovel(int) error                   { return nil }
func (m *mockNovelService) SuspendNovel(context.Context, int) error { return nil }
func (m *mockNovelService) UnbanNovel(context.Context, int) error   { return nil }

type mockSceneService struct {
	scene            models.SceneResponse
	scenes           map[int]models.SceneResponse
	startScene       models.SceneResponse
	endings          []models.EndingScene
	choice           *models.Choice
	publicationCheck service.PublishValidationResult
}

func (m *mockSceneService) GetScene(id int) (models.SceneResponse, error) {
	if m.scenes != nil {
		scene, ok := m.scenes[id]
		if !ok {
			return models.SceneResponse{}, errors.New("scene not found")
		}
		return scene, nil
	}
	return m.scene, nil
}
func (m *mockSceneService) GetStartScene(int) (models.SceneResponse, error) {
	return m.startScene, nil
}
func (m *mockSceneService) GetScenesByChapterID(int) ([]models.Scene, error) { return nil, nil }
func (m *mockSceneService) CreateScene(models.Scene) (int, error)            { return 0, nil }
func (m *mockSceneService) UpdateScene(models.Scene) error                   { return nil }
func (m *mockSceneService) DeleteScene(int) error                            { return nil }
func (m *mockSceneService) SyncSceneChoices(int, []interface{}) (*models.ChoiceDiff, error) {
	return nil, nil
}
func (m *mockSceneService) GetChoiceByID(int) (*models.Choice, error) { return m.choice, nil }
func (m *mockSceneService) CreateChoice(models.Choice) (int, error)   { return 0, nil }
func (m *mockSceneService) UpdateChoice(models.Choice) error          { return nil }
func (m *mockSceneService) DeleteChoice(int) error                    { return nil }
func (m *mockSceneService) GetStoryTree(int, int) (models.StoryTreeResponse, error) {
	return models.StoryTreeResponse{}, nil
}
func (m *mockSceneService) GetEndingsByNovelID(int, int) ([]models.EndingScene, error) {
	return m.endings, nil
}
func (m *mockSceneService) ValidateStoryForPublish(int) service.PublishValidationResult {
	return service.PublishValidationResult{}
}
func (m *mockSceneService) ValidateNovelPublishability(int) service.PublishValidationResult {
	return m.publicationCheck
}
func (m *mockSceneService) UpdateScenePosition(int, *float64, *float64) error { return nil }
func (m *mockSceneService) Ping() error                                       { return nil }

type mockChapterService struct {
	chapter   *models.Chapter
	chapters  map[int]*models.Chapter
	deleteErr error
}

func (m *mockChapterService) GetChaptersByNovelID(int) ([]models.Chapter, error) { return nil, nil }
func (m *mockChapterService) GetChapterByID(id int) (*models.Chapter, error) {
	if m.chapters != nil {
		return m.chapters[id], nil
	}
	return m.chapter, nil
}
func (m *mockChapterService) CreateChapter(models.Chapter) (int, error) { return 0, nil }
func (m *mockChapterService) UpdateChapter(models.Chapter) error        { return nil }
func (m *mockChapterService) DeleteChapter(int) error                   { return m.deleteErr }
func (m *mockChapterService) ReorderChapters([]int) error               { return nil }

type mockReadingService struct {
	savedProgress      *models.ReadingProgress
	saveProgressErr    error
	progress           *models.ReadingProgress
	progressUser       int
	resetUser          int
	choiceHistory      *models.ChoiceHistory
	recordEndingCalled bool
}

func (m *mockReadingService) GetProgress(userID, _ int) (*models.ReadingProgress, error) {
	m.progressUser = userID
	return m.progress, nil
}
func (m *mockReadingService) SaveProgress(progress models.ReadingProgress) error {
	m.savedProgress = &progress
	return m.saveProgressErr
}
func (m *mockReadingService) ResetProgress(userID, _ int) error {
	m.resetUser = userID
	return nil
}
func (m *mockReadingService) GetReadingHistory(int) ([]models.Novel, error) { return nil, nil }
func (m *mockReadingService) RecordChoiceHistory(history models.ChoiceHistory) error {
	m.choiceHistory = &history
	return nil
}
func (m *mockReadingService) RecordEnding(userID, novelID, sceneID int) error {
	m.recordEndingCalled = true
	return nil
}
func (m *mockReadingService) DeleteReadingHistoryByNovel(int, int) (bool, error) {
	return true, nil
}
func (m *mockReadingService) DeleteReadingHistoryByUser(int, []int) (int, error) { return 0, nil }

type mockWriterService struct {
	writer *models.Writer
}

func (m *mockWriterService) GetWriterByID(int) (*models.Writer, error) { return m.writer, nil }
func (m *mockWriterService) GetWriterByUserID(userID int) (*models.Writer, error) {
	if m.writer == nil {
		return nil, errors.New("not found")
	}
	if m.writer.UserID != userID {
		return nil, errors.New("not found")
	}
	return m.writer, nil
}
func (m *mockWriterService) GetLatestWriterApplicationByUserID(int) (*models.Writer, error) {
	return nil, nil
}
func (m *mockWriterService) ApplyForWriter(context.Context, uint, dto.WriterApplyRequest) error {
	return nil
}
func (m *mockWriterService) GetPendingRequests(context.Context, string, int, int) ([]dto.WriterRequestResponse, error) {
	return nil, nil
}
func (m *mockWriterService) ApproveWriter(context.Context, uint, uint) error { return nil }
func (m *mockWriterService) RejectWriter(context.Context, uint, uint, string) error {
	return nil
}
func (m *mockWriterService) UpdateWriterProfile(context.Context, int, dto.UpdateWriterProfileRequest) error {
	return nil
}

func TestSaveProgressRejectsDraftSceneForReader(t *testing.T) {
	readingSvc := &mockReadingService{}
	novelSvc := &mockNovelService{novel: models.Novel{ID: 1, IsPublished: true}}
	sceneSvc := &mockSceneService{scene: models.SceneResponse{SceneID: 10, NovelID: 1, ChapterID: 100, Status: "draft"}}
	chapterSvc := &mockChapterService{chapter: &models.Chapter{ChapterID: 100, NovelID: 1, Status: "published"}}
	writerSvc := &mockWriterService{writer: nil}

	handler := SaveProgressHandler(readingSvc, novelSvc, writerSvc, sceneSvc, chapterSvc)

	body, _ := json.Marshal(map[string]int{
		"user_id":          5,
		"novel_id":         1,
		"current_scene_id": 10,
	})

	req := httptest.NewRequest(http.MethodPost, "/progress", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for draft scene, got %d", w.Code)
	}
	if readingSvc.savedProgress != nil {
		t.Fatalf("expected progress not to be saved, but was saved")
	}
}

func TestSaveProgressAllowsPublishedSceneForReader(t *testing.T) {
	readingSvc := &mockReadingService{}
	novelSvc := &mockNovelService{novel: models.Novel{ID: 1, IsPublished: true}}
	sceneSvc := &mockSceneService{scene: models.SceneResponse{SceneID: 10, NovelID: 1, ChapterID: 100, Status: "published"}}
	chapterSvc := &mockChapterService{chapter: &models.Chapter{ChapterID: 100, NovelID: 1, Status: "published"}}
	writerSvc := &mockWriterService{writer: nil}

	handler := SaveProgressHandler(readingSvc, novelSvc, writerSvc, sceneSvc, chapterSvc)

	body, _ := json.Marshal(map[string]int{
		"user_id":          5,
		"novel_id":         1,
		"current_scene_id": 10,
	})

	req := httptest.NewRequest(http.MethodPost, "/progress", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for published scene, got %d", w.Code)
	}
	if readingSvc.savedProgress == nil || readingSvc.savedProgress.CurrentSceneID != 10 {
		t.Fatalf("expected progress to be saved with scene 10")
	}
}

func TestDeleteChapterReturns409WhenDependenciesExist(t *testing.T) {
	tests := []struct {
		name      string
		deleteErr error
	}{
		{"has start scene", repository.ErrChapterHasStartScene},
		{"has incoming choices", repository.ErrChapterHasIncomingChoices},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chapterSvc := &mockChapterService{
				chapter:   &models.Chapter{ChapterID: 10, NovelID: 1},
				deleteErr: tt.deleteErr,
			}
			novelSvc := &mockNovelService{novel: models.Novel{ID: 1, AuthorID: 99}}
			writerSvc := &mockWriterService{writer: &models.Writer{WriterID: 99, UserID: 42}}

			handler := DeleteChapterHandler(chapterSvc, novelSvc, writerSvc, nil)

			req := httptest.NewRequest(http.MethodDelete, "/chapters/10", nil)
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, uint(42))
			req = req.WithContext(ctx)
			w := httptest.NewRecorder()

			handler(w, req)

			if w.Code != http.StatusConflict {
				t.Fatalf("expected 409 Conflict, got %d", w.Code)
			}
		})
	}
}
