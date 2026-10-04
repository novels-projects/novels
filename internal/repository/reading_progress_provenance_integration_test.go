package repository

import (
	"errors"
	"testing"
	"time"

	"novel-be/internal/models"
)

func TestSaveReadingProgressRequiresChoiceAndPreservesReachedEnding(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()
	db.SetMaxOpenConns(1)

	temporaryTables := []string{
		`CREATE TEMP TABLE novels (novel_id INTEGER PRIMARY KEY, is_published BOOLEAN NOT NULL)`,
		`CREATE TEMP TABLE chapters (chapter_id INTEGER PRIMARY KEY, novel_id INTEGER NOT NULL, status TEXT NOT NULL)`,
		`CREATE TEMP TABLE scenes (scene_id INTEGER PRIMARY KEY, novel_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL)`,
		`CREATE TEMP TABLE choices (choice_id INTEGER PRIMARY KEY, from_scene_id INTEGER NOT NULL, to_scene_id INTEGER NOT NULL)`,
		`CREATE TEMP TABLE reading_progress (progress_id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, novel_id INTEGER NOT NULL, current_scene_id INTEGER NOT NULL, updated_at TIMESTAMP, UNIQUE (user_id, novel_id))`,
		`CREATE TEMP TABLE user_scene_history (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, scene_id INTEGER NOT NULL, visited_at TIMESTAMP NOT NULL, visit_count INTEGER NOT NULL, UNIQUE (user_id, scene_id))`,
		`CREATE TEMP TABLE user_choice_history (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, choice_id INTEGER NOT NULL, selected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TEMP TABLE user_endings (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, scene_id INTEGER NOT NULL, reached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, scene_id))`,
	}
	for _, statement := range temporaryTables {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("create temporary test table: %v", err)
		}
	}
	if _, err := db.Exec(`
		INSERT INTO novels VALUES (7, TRUE);
		INSERT INTO chapters VALUES (70, 7, 'published');
		INSERT INTO scenes VALUES
			(1, 7, 70, 'start', 'published'),
			(2, 7, 70, 'normal', 'published'),
			(3, 7, 70, 'ending', 'published'),
			(4, 7, 70, 'normal', 'published');
		INSERT INTO choices VALUES
			(10, 1, 2),
			(11, 2, 3),
			(12, 2, 4);
	`); err != nil {
		t.Fatalf("seed temporary test data: %v", err)
	}

	repo := &postgresReadingRepository{db: db}
	const userID, novelID = 42, 7
	if err := repo.SaveReadingProgress(userID, novelID, 3); !errors.Is(err, ErrReadingProgressTransitionInvalid) {
		t.Fatalf("direct initial progress to ending should be rejected, got %v", err)
	}
	if err := repo.SaveReadingProgress(userID, novelID, 1); err != nil {
		t.Fatalf("saving the start scene should succeed: %v", err)
	}
	if err := repo.SaveReadingProgress(userID, novelID, 3); !errors.Is(err, ErrReadingProgressTransitionInvalid) {
		t.Fatalf("direct progress from start to ending should be rejected, got %v", err)
	}
	const firstChoiceUserID = 43
	if err := repo.InsertChoiceHistory(models.ChoiceHistory{UserID: firstChoiceUserID, ChoiceID: 10}); err != nil {
		t.Fatalf("record first choice before initial progress save: %v", err)
	}
	time.Sleep(2 * time.Millisecond)
	if err := repo.SaveReadingProgress(firstChoiceUserID, novelID, 2); err != nil {
		t.Fatalf("valid start choice should initialize progress when the initial save is pending: %v", err)
	}

	if err := repo.InsertChoiceHistory(models.ChoiceHistory{UserID: userID, ChoiceID: 10}); err != nil {
		t.Fatalf("record start choice: %v", err)
	}
	time.Sleep(2 * time.Millisecond)
	if err := repo.SaveReadingProgress(userID, novelID, 2); err != nil {
		t.Fatalf("valid start choice should advance progress: %v", err)
	}
	progress, err := repo.GetReadingProgress(userID, novelID)
	if err != nil || progress == nil || progress.CurrentSceneID != 2 {
		t.Fatalf("expected resumable current scene 2, progress=%+v err=%v", progress, err)
	}

	if err := repo.SaveReadingProgress(userID, novelID, 3); !errors.Is(err, ErrReadingProgressTransitionInvalid) {
		t.Fatalf("direct progress from normal scene to ending should be rejected, got %v", err)
	}
	if err := repo.InsertChoiceHistory(models.ChoiceHistory{UserID: userID, ChoiceID: 11}); err != nil {
		t.Fatalf("record ending choice: %v", err)
	}
	time.Sleep(2 * time.Millisecond)
	if err := repo.SaveReadingProgress(userID, novelID, 3); err != nil {
		t.Fatalf("valid choice to ending should succeed: %v", err)
	}

	var endingCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM user_endings WHERE user_id = $1 AND scene_id = 3`, userID).Scan(&endingCount); err != nil {
		t.Fatalf("read reached ending: %v", err)
	}
	if endingCount != 1 {
		t.Fatalf("expected valid ending transition to persist once, got %d records", endingCount)
	}

	if err := repo.ResetReadingProgress(userID, novelID); err != nil {
		t.Fatalf("reset progress for replay: %v", err)
	}
	if err := repo.SaveReadingProgress(userID, novelID, 1); err != nil {
		t.Fatalf("replay should be able to start again: %v", err)
	}
	if err := repo.SaveReadingProgress(userID, novelID, 2); err != nil {
		t.Fatalf("replay should allow revisiting a previously visited scene: %v", err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM user_endings WHERE user_id = $1 AND scene_id = 3`, userID).Scan(&endingCount); err != nil {
		t.Fatalf("read ending after replay: %v", err)
	}
	if endingCount != 1 {
		t.Fatalf("replay should preserve finished history without duplicating endings, got %d records", endingCount)
	}
}
