package repository

import (
	"database/sql"
	"testing"
)

func TestGetStartSceneByNovelIDRequiresStartType(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()
	db.SetMaxOpenConns(1)

	for _, statement := range []string{
		`CREATE TEMP TABLE novels (novel_id INTEGER PRIMARY KEY, title TEXT NOT NULL)`,
		`CREATE TEMP TABLE chapters (chapter_id INTEGER PRIMARY KEY, novel_id INTEGER NOT NULL, title TEXT NOT NULL, episode INTEGER NOT NULL)`,
		`CREATE TEMP TABLE scenes (
			scene_id INTEGER PRIMARY KEY,
			chapter_id INTEGER NOT NULL,
			novel_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			image_url TEXT NOT NULL,
			type TEXT NOT NULL,
			status TEXT NOT NULL,
			ending_title TEXT,
			ending_type TEXT,
			ending_description TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("create temporary table: %v", err)
		}
	}

	if _, err := db.Exec(`
		INSERT INTO novels VALUES (7, 'Test novel');
		INSERT INTO chapters VALUES (70, 7, 'Chapter 1', 1);
		INSERT INTO scenes VALUES
			(1, 70, 7, 'Normal scene', '', '', 'normal', 'published', NULL, NULL, NULL, NOW(), NOW()),
			(2, 70, 7, 'Start scene', '', '', 'start', 'published', NULL, NULL, NULL, NOW(), NOW())
	`); err != nil {
		t.Fatalf("seed temporary tables: %v", err)
	}

	start, err := GetStartSceneByNovelID(db, 7)
	if err != nil {
		t.Fatalf("expected type=start scene, got error: %v", err)
	}
	if start.SceneID != 2 || start.Type != "start" {
		t.Fatalf("expected canonical start scene 2, got scene %+v", start)
	}

	if _, err := db.Exec(`DELETE FROM scenes WHERE type = 'start'`); err != nil {
		t.Fatalf("delete start scene: %v", err)
	}
	start, err = GetStartSceneByNovelID(db, 7)
	if start != nil || err != sql.ErrNoRows {
		t.Fatalf("expected no start scene instead of a normal-scene fallback, got scene %+v, err %v", start, err)
	}
}
