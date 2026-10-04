package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"novel-be/internal/models"

	"github.com/lib/pq"
)

var ErrReadingHistoryForbidden = errors.New("reading history is not owned by the authenticated user")
var ErrReadingProgressTransitionInvalid = errors.New("reading progress must follow a valid story choice")

// ======= Reading Repository Methods =======

func (r *postgresReadingRepository) GetReadingProgress(userID, novelID int) (*models.ReadingProgress, error) {
	row := r.db.QueryRow(`
		SELECT progress_id, user_id, novel_id, current_scene_id, updated_at
		FROM reading_progress
		WHERE user_id = $1 AND novel_id = $2 AND updated_at IS NOT NULL
	`, userID, novelID)

	var progress models.ReadingProgress
	var updatedAt sql.NullTime

	err := row.Scan(
		&progress.ProgressID,
		&progress.UserID,
		&progress.NovelID,
		&progress.CurrentSceneID,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	if updatedAt.Valid {
		updatedAtValue := updatedAt.Time
		progress.UpdatedAt = &updatedAtValue
	}

	return &progress, nil
}

func (r *postgresReadingRepository) SaveReadingProgress(userID, novelID, sceneID int) error {
	// 1. เริ่มทำ Transaction
	// เพื่อให้ reading_progress และ user_scene_history
	// สำเร็จ/rollback พร้อมกัน
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	// ถ้ามีอะไรผิดพลาดกลางทาง ให้ Rollback
	defer tx.Rollback()

	var targetType, targetStatus, targetChapterStatus string
	var novelIsPublished bool
	err = tx.QueryRow(`
		SELECT s.type, s.status, ch.status, n.is_published
		FROM scenes s
		JOIN chapters ch ON ch.chapter_id = s.chapter_id
		JOIN novels n ON n.novel_id = s.novel_id
		WHERE s.scene_id = $1 AND s.novel_id = $2
	`, sceneID, novelID).Scan(&targetType, &targetStatus, &targetChapterStatus, &novelIsPublished)
	if err != nil {
		return ErrReadingProgressTransitionInvalid
	}

	var currentSceneID int
	var currentUpdatedAt time.Time
	err = tx.QueryRow(`
		SELECT current_scene_id, updated_at
		FROM reading_progress
		WHERE user_id = $1 AND novel_id = $2 AND updated_at IS NOT NULL
		FOR UPDATE
	`, userID, novelID).Scan(&currentSceneID, &currentUpdatedAt)
	hasCurrentProgress := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	progressChanged := !hasCurrentProgress || currentSceneID != sceneID
	validTransition := false
	if !hasCurrentProgress && targetType != "start" {
		var selectedFromStart bool
		err = tx.QueryRow(`
			SELECT EXISTS (
				SELECT 1
				FROM user_choice_history uch
				JOIN choices c ON c.choice_id = uch.choice_id
				JOIN scenes source ON source.scene_id = c.from_scene_id
				JOIN scenes target ON target.scene_id = c.to_scene_id
				JOIN chapters source_chapter ON source_chapter.chapter_id = source.chapter_id
				JOIN chapters target_chapter ON target_chapter.chapter_id = target.chapter_id
				JOIN novels n ON n.novel_id = source.novel_id
				WHERE uch.user_id = $1
				  AND c.to_scene_id = $2
				  AND source.novel_id = $3
				  AND target.novel_id = $3
				  AND source.type = 'start'
				  AND source.status = 'published'
				  AND target.status = 'published'
				  AND source_chapter.status = 'published'
				  AND target_chapter.status = 'published'
				  AND n.is_published = TRUE
			)
		`, userID, sceneID, novelID).Scan(&selectedFromStart)
		if err != nil {
			return err
		}
		validTransition = selectedFromStart
		if !validTransition {
			canReplay, err := canReplayScene(tx, userID, novelID, sceneID, targetType)
			if err != nil {
				return err
			}
			if !canReplay {
				return ErrReadingProgressTransitionInvalid
			}
		}
	} else if hasCurrentProgress && currentSceneID != sceneID {
		var selectedFromCurrentScene bool
		err = tx.QueryRow(`
			SELECT EXISTS (
				SELECT 1
				FROM user_choice_history uch
				JOIN choices c ON c.choice_id = uch.choice_id
				JOIN scenes source ON source.scene_id = c.from_scene_id
				JOIN scenes target ON target.scene_id = c.to_scene_id
				JOIN chapters source_chapter ON source_chapter.chapter_id = source.chapter_id
				JOIN chapters target_chapter ON target_chapter.chapter_id = target.chapter_id
				JOIN novels n ON n.novel_id = source.novel_id
				WHERE uch.user_id = $1
				  AND c.from_scene_id = $2
				  AND c.to_scene_id = $3
				  AND source.novel_id = $4
				  AND target.novel_id = $4
				  AND source.type <> 'ending'
				  AND target.type <> 'start'
				  AND source.status = 'published'
				  AND target.status = 'published'
				  AND source_chapter.status = 'published'
				  AND target_chapter.status = 'published'
				  AND n.is_published = TRUE
				  AND uch.selected_at > $5
			)
		`, userID, currentSceneID, sceneID, novelID, currentUpdatedAt).Scan(&selectedFromCurrentScene)
		if err != nil {
			return err
		}
		validTransition = selectedFromCurrentScene
		if !validTransition {
			canReplay, err := canReplayScene(tx, userID, novelID, sceneID, targetType)
			if err != nil {
				return err
			}
			if !canReplay {
				return ErrReadingProgressTransitionInvalid
			}
		}
	}

	// 2. เซฟจุดปัจจุบัน (Bookmark)
	progressQuery := `
		INSERT INTO reading_progress (
			user_id,
			novel_id,
			current_scene_id,
			updated_at
		)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id, novel_id)
		DO UPDATE SET
			current_scene_id = EXCLUDED.current_scene_id,
			updated_at = CURRENT_TIMESTAMP
	`

	if _, err := tx.Exec(progressQuery, userID, novelID, sceneID); err != nil {
		return err
	}

	// 3. บันทึกประวัติการเข้าฉาก
	//
	// visit_count:
	// - ครั้งแรก = 1
	// - กลับมาอีกครั้ง = +1
	// - ไม่เปลี่ยน visited_at เพื่อรักษาความหมายเดิม
	//   ของ Reading History ว่าเป็นเวลาที่เริ่มเข้าฉาก
	historyQuery := `
		INSERT INTO user_scene_history (
			user_id,
			scene_id,
			visited_at,
			visit_count
		)
		VALUES ($1, $2, CURRENT_TIMESTAMP, 1)
		ON CONFLICT (user_id, scene_id)
		DO UPDATE SET
			visit_count = user_scene_history.visit_count + 1
	`

	if _, err := tx.Exec(historyQuery, userID, sceneID); err != nil {
		return err
	}

	if progressChanged && validTransition && targetType == "ending" && targetStatus == "published" && targetChapterStatus == "published" && novelIsPublished {
		if _, err := tx.Exec(`
			INSERT INTO user_endings (user_id, scene_id)
			VALUES ($1, $2)
			ON CONFLICT (user_id, scene_id) DO NOTHING
		`, userID, sceneID); err != nil {
			return err
		}
	}

	// 4. ถ้าผ่านทั้ง 2 คำสั่ง ให้ Commit
	return tx.Commit()
}

func canReplayScene(tx *sql.Tx, userID, novelID, sceneID int, sceneType string) (bool, error) {
	if sceneType == "ending" {
		var alreadyUnlocked bool
		err := tx.QueryRow(`
			SELECT EXISTS (
				SELECT 1
				FROM user_endings ue
				JOIN scenes s ON s.scene_id = ue.scene_id
				WHERE ue.user_id = $1
				  AND ue.scene_id = $2
				  AND s.novel_id = $3
			)
		`, userID, sceneID, novelID).Scan(&alreadyUnlocked)
		return alreadyUnlocked, err
	}

	var previouslyVisited bool
	err := tx.QueryRow(`
		SELECT EXISTS (
			SELECT 1
			FROM user_scene_history ush
			JOIN scenes s ON s.scene_id = ush.scene_id
			WHERE ush.user_id = $1
			  AND ush.scene_id = $2
			  AND s.novel_id = $3
			  AND (
				  s.type = 'start'
				  OR EXISTS (
					  SELECT 1
					  FROM user_choice_history uch
					  JOIN choices c ON c.choice_id = uch.choice_id
					  JOIN scenes source ON source.scene_id = c.from_scene_id
					  JOIN user_scene_history source_history
						ON source_history.user_id = uch.user_id
						AND source_history.scene_id = source.scene_id
					  WHERE uch.user_id = ush.user_id
						AND c.to_scene_id = s.scene_id
						AND source.novel_id = s.novel_id
						AND source.type <> 'ending'
				  )
			  )
		)
	`, userID, sceneID, novelID).Scan(&previouslyVisited)
	return previouslyVisited, err
}

func (r *postgresReadingRepository) InsertSceneHistory(userID int, sceneID int) error {
	query := `
		INSERT INTO user_scene_history (
			user_id,
			scene_id,
			visited_at,
			visit_count
		)
		VALUES ($1, $2, CURRENT_TIMESTAMP, 1)
		ON CONFLICT (user_id, scene_id)
		DO UPDATE SET
			visit_count = user_scene_history.visit_count + 1
	`

	_, err := r.db.Exec(query, userID, sceneID)
	return err
}

func (r *postgresReadingRepository) InsertChoiceHistory(history models.ChoiceHistory) error {
	query := `
		INSERT INTO user_choice_history (
			user_id,
			choice_id
		)
		VALUES ($1, $2)
	`

	_, err := r.db.Exec(query, history.UserID, history.ChoiceID)

	return err
}

func (r *postgresReadingRepository) InsertUserEnding(userID, novelID, sceneID int) error {
	// user_endings ใช้บันทึกว่า user ปลดล็อก ending นี้แล้วหรือยัง
	// ไม่ต้องนับจำนวนครั้งซ้ำ เพราะ table นี้เป็น unique ต่อ user + scene
	query := `
		INSERT INTO user_endings (
			user_id,
			scene_id
		)
		VALUES ($1, $2)
		ON CONFLICT (user_id, scene_id) DO NOTHING
	`

	_, err := r.db.Exec(query, userID, sceneID)
	return err
}

func (r *postgresReadingRepository) GetReadingHistory(userID int) ([]models.Novel, error) {
	rows, err := r.db.Query(`
		WITH last_scene_per_novel AS (
			SELECT
				ush.user_id,
				ush.scene_id,
				ush.visited_at,
				ROW_NUMBER() OVER (
					PARTITION BY s.novel_id
					ORDER BY ush.visited_at DESC
				) AS rn
			FROM user_scene_history ush
			JOIN scenes s ON s.scene_id = ush.scene_id
			WHERE ush.user_id = $1
		),
		last_choice_per_novel AS (
			SELECT
				uch.user_id,
				c.label,
				uch.selected_at,
				s.novel_id,
				ROW_NUMBER() OVER (
					PARTITION BY s.novel_id
					ORDER BY uch.selected_at DESC
				) AS rn
			FROM user_choice_history uch
			JOIN choices c ON c.choice_id = uch.choice_id
			JOIN scenes s ON c.to_scene_id = s.scene_id
			WHERE uch.user_id = $1
		)
		SELECT
			n.novel_id,
			n.title,
			n.captions,
			n.introduction,
			n.cover_image,
			CASE
				WHEN n.is_completed AND n.is_published THEN 'completed-published'
				WHEN n.is_completed THEN 'completed-draft'
				WHEN n.is_published THEN 'published'
				ELSE 'draft'
			END AS status,
			n.is_published,
			n.is_completed,
			n.author_id,
			n.views,
			n.created_at,
			n.updated_at,
			(SELECT COUNT(*)
			 FROM chapters ch
			 WHERE ch.novel_id = n.novel_id) AS chapter_count,
			(SELECT COUNT(*)
			 FROM scenes s
			 WHERE s.novel_id = n.novel_id) AS scene_count,
			w.name_lastname,
			w.pen_name,
			(SELECT COALESCE(COUNT(*), 0)
			 FROM likes l
			 WHERE l.novel_id = n.novel_id) AS like_count,
			(SELECT COALESCE(COUNT(*), 0)
			 FROM bookshelves b
			 WHERE b.novel_id = n.novel_id) AS bookshelf_count,
			COALESCE(
				json_agg(
					json_build_object(
						'category_id', c.category_id,
						'name', c.name
					)
				) FILTER (WHERE c.category_id IS NOT NULL),
				'[]'
			) AS categories_json,
			COALESCE(rp.current_scene_id, 0) AS current_scene_id,
			COALESCE(visited_stats.visited_count, 0) AS visited_count,
			COALESCE(ue.ending_count, 0) AS ending_count,
			CASE
				WHEN COALESCE(ue.ending_count, 0) > 0 THEN 'finished'
				WHEN COALESCE(rp.current_scene_id, 0) > 0 THEN 'reading'
				ELSE 'want_to_read'
			END AS reading_status,
			COALESCE(last_read.visited_at, NULL) AS last_read_at,
			COALESCE(last_read.scene_id, 0) AS last_read_scene_id,
			COALESCE(last_read.scene_title, '') AS last_read_scene_title,
			COALESCE(last_read.chapter_number, 0) AS last_read_chapter_number,
			COALESCE(last_read.chapter_title, '') AS last_read_chapter_title,
			COALESCE(last_read.scene_number, 0) AS last_read_scene_number,
			COALESCE(last_read.scene_name, '') AS last_read_scene_name,
			COALESCE(last_choice.choice_text, '') AS last_choice_text,
			COALESCE(
				(SELECT COUNT(*)
				 FROM scenes s2
				 WHERE s2.novel_id = n.novel_id),
				0
			) AS total_scenes
		FROM reading_progress rp
		JOIN novels n
			ON n.novel_id = rp.novel_id
		LEFT JOIN writers w
			ON n.author_id = w.writer_id
		LEFT JOIN novel_categories nc
			ON n.novel_id = nc.novel_id
		LEFT JOIN categories c
			ON nc.category_id = c.category_id
		LEFT JOIN (
			SELECT
				ush.user_id,
				s.novel_id,
				COUNT(*) AS visited_count
			FROM user_scene_history ush
			JOIN scenes s
				ON ush.scene_id = s.scene_id
			WHERE ush.user_id = $1
			GROUP BY ush.user_id, s.novel_id
		) visited_stats
			ON visited_stats.user_id = rp.user_id
			AND visited_stats.novel_id = n.novel_id
		LEFT JOIN LATERAL (
			SELECT
				lsp.scene_id,
				lsp.visited_at,
				s.title AS scene_title,
				ch.episode AS chapter_number,
				ch.title AS chapter_title,
				ROW_NUMBER() OVER (
					PARTITION BY s.chapter_id
					ORDER BY s.scene_id
				) AS scene_number,
				s.title AS scene_name
			FROM last_scene_per_novel lsp
			JOIN scenes s
				ON s.scene_id = lsp.scene_id
			JOIN chapters ch
				ON ch.chapter_id = s.chapter_id
			WHERE lsp.user_id = rp.user_id
				AND s.novel_id = n.novel_id
				AND lsp.rn = 1
			LIMIT 1
		) last_read
			ON true
		LEFT JOIN LATERAL (
			SELECT
				lcp.label AS choice_text
			FROM last_choice_per_novel lcp
			WHERE lcp.user_id = rp.user_id
				AND lcp.novel_id = n.novel_id
				AND lcp.rn = 1
			LIMIT 1
		) last_choice
			ON true
		LEFT JOIN (
			SELECT
				ue.user_id,
				s.novel_id,
				COUNT(*) AS ending_count
			FROM user_endings ue
			JOIN scenes s
				ON s.scene_id = ue.scene_id
			WHERE ue.user_id = $1
			GROUP BY ue.user_id, s.novel_id
		) ue
			ON ue.user_id = rp.user_id
			AND ue.novel_id = n.novel_id
		WHERE rp.user_id = $1
			AND rp.updated_at IS NOT NULL
		GROUP BY
			n.novel_id,
			w.writer_id,
			rp.current_scene_id,
			rp.updated_at,
			visited_stats.visited_count,
			ue.ending_count,
			last_read.visited_at,
			last_read.scene_id,
			last_read.scene_title,
			last_read.chapter_number,
			last_read.chapter_title,
			last_read.scene_number,
			last_read.scene_name,
			last_choice.choice_text
		ORDER BY rp.updated_at DESC
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var novels []models.Novel

	for rows.Next() {
		var n models.Novel
		var authorName, penName *string
		var categoriesJSON []byte
		var currentSceneID int
		var visitedCount, endingCount, totalScenes int
		var lastReadSceneID int
		var lastReadSceneTitle, lastReadChapterTitle, lastReadSceneName, lastChoiceText string
		var lastReadChapterNumber, lastReadSceneNumber int
		var readingStatus string
		var lastReadAt sql.NullTime

		if err := rows.Scan(
			&n.ID,
			&n.Title,
			&n.Captions,
			&n.Introduction,
			&n.CoverImage,
			&n.Status,
			&n.IsPublished,
			&n.IsCompleted,
			&n.AuthorID,
			&n.Views,
			&n.CreatedAt,
			&n.UpdatedAt,
			&n.ChapterCount,
			&n.SceneCount,
			&authorName,
			&penName,
			&n.LikeCount,
			&n.BookshelfCount,
			&categoriesJSON,
			&currentSceneID,
			&visitedCount,
			&endingCount,
			&readingStatus,
			&lastReadAt,
			&lastReadSceneID,
			&lastReadSceneTitle,
			&lastReadChapterNumber,
			&lastReadChapterTitle,
			&lastReadSceneNumber,
			&lastReadSceneName,
			&lastChoiceText,
			&totalScenes,
		); err != nil {
			return nil, err
		}

		if authorName != nil {
			n.AuthorName = *authorName
		}

		if penName != nil {
			n.PenName = *penName
		}

		if len(categoriesJSON) > 0 {
			if err := json.Unmarshal(categoriesJSON, &n.Categories); err != nil {
				return nil, err
			}

			for _, cat := range n.Categories {
				n.CategoryIDs = append(n.CategoryIDs, cat.CategoryID)
			}
		}

		n.CurrentSceneID = currentSceneID
		n.VisitedCount = visitedCount
		n.EndingCount = endingCount
		n.ReadingStatus = readingStatus

		if lastReadAt.Valid {
			n.LastReadAt = lastReadAt.Time
		}

		n.LastReadSceneID = lastReadSceneID
		n.LastReadSceneTitle = lastReadSceneTitle
		n.LastReadChapterNumber = lastReadChapterNumber
		n.LastReadChapterTitle = lastReadChapterTitle
		n.LastReadSceneNumber = lastReadSceneNumber
		n.LastReadSceneName = lastReadSceneName
		n.LastChoiceText = lastChoiceText
		n.TotalScenes = totalScenes

		novels = append(novels, n)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return novels, nil
}

func (r *postgresReadingRepository) ResetReadingProgress(userID, novelID int) error {
	// Restart = เริ่มอ่านใหม่
	// รีเซ็ตเฉพาะ progress/bookmark ปัจจุบัน
	//
	// ไม่ลบ:
	// - user_scene_history
	// - user_choice_history
	// - user_endings
	//
	// เพราะข้อมูลเหล่านี้ใช้เป็นประวัติการอ่านและ Writer Analytics
	_, err := r.db.Exec(`
		DELETE FROM reading_progress
		WHERE user_id = $1
		  AND novel_id = $2
	`, userID, novelID)

	return err
}

func (r *postgresReadingRepository) DeleteReadingHistoryByNovel(userID, novelID int) (bool, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return false, err
	}

	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE reading_progress
		SET updated_at = NULL
		WHERE user_id = $1 AND novel_id = $2
	`, userID, novelID)

	if err != nil {
		return false, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}

	if rowsAffected == 0 {
		return false, nil
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return true, nil
}

func (r *postgresReadingRepository) DeleteReadingHistoryByUser(userID int, novelIDs []int) (int, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return 0, err
	}

	defer tx.Rollback()

	if len(novelIDs) == 0 {
		res, err := tx.Exec(`
			UPDATE reading_progress
			SET updated_at = NULL
			WHERE user_id = $1 AND updated_at IS NOT NULL
		`, userID)

		if err != nil {
			return 0, err
		}

		count, err := res.RowsAffected()
		if err != nil {
			return 0, err
		}

		if err := tx.Commit(); err != nil {
			return 0, err
		}

		return int(count), nil
	}

	res, err := tx.Exec(`
		UPDATE reading_progress
		SET updated_at = NULL
		WHERE user_id = $1
		AND novel_id = ANY($2::int[])
		AND updated_at IS NOT NULL
	`, userID, pq.Array(novelIDs))

	if err != nil {
		return 0, err
	}

	count, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return int(count), nil
}
