package repository

import (
	"database/sql"
	"novel-be/internal/models"
)

// GetSceneByID ดึงข้อมูลฉากจาก ID
func GetSceneByID(db *sql.DB, id int) (*models.Scene, error) {
	var endingTitle, endingType, endingDescription sql.NullString

	// 🎯 ใช้ INNER JOIN ไปเกี่ยวเอาชื่อเรื่องนิยายหลัก และชื่อตอนย่อยมาพร้อมกันเลยครับน้า
	row := db.QueryRow(`
		SELECT 
			s.scene_id, s.chapter_id, s.novel_id, s.title, s.content, s.image_url, s.type, s.status,
			s.ending_title, s.ending_type, s.ending_description,
			s.created_at, s.updated_at,
			n.title AS novel_title,
            c.title AS chapter_title,
            c.episode AS chapter_episode
        FROM scenes s
        INNER JOIN novels n ON s.novel_id = n.novel_id
        INNER JOIN chapters c ON s.chapter_id = c.chapter_id
        WHERE s.scene_id = $1
    `, id)

	var s models.Scene
	err := row.Scan(
		&s.SceneID, &s.ChapterID, &s.NovelID, &s.Title, &s.Content, &s.ImageURL, &s.Type, &s.Status,
		&endingTitle, &endingType, &endingDescription,
		&s.CreatedAt, &s.UpdatedAt,
		&s.NovelTitle, &s.ChapterTitle,
		&s.ChapterEpisode,
	)
	if err != nil {
		return nil, err
	}
	if endingTitle.Valid {
		s.EndingTitle = &endingTitle.String
	}
	if endingType.Valid {
		s.EndingType = &endingType.String
	}
	if endingDescription.Valid {
		s.EndingDescription = &endingDescription.String
	}

	return &s, nil
}

// GetStartSceneByNovelID หาจุดเริ่มต้นของนิยายร่วมกับชื่อเรื่องนิยายและชื่อตอน
func GetStartSceneByNovelID(db *sql.DB, novelID int) (*models.Scene, error) {
	var endingTitle, endingType, endingDescription sql.NullString

	// Start ของ Reader ต้องเป็น Scene ที่กำหนด type เป็น start เท่านั้น
	row := db.QueryRow(`
		SELECT 
			s.scene_id, s.chapter_id, s.novel_id, s.title, s.content, s.image_url, s.type, s.status,
			s.ending_title, s.ending_type, s.ending_description,
			s.created_at, s.updated_at,
			n.title AS novel_title,
            c.title AS chapter_title,
            c.episode AS chapter_episode
        FROM scenes s
        INNER JOIN novels n ON s.novel_id = n.novel_id
        INNER JOIN chapters c ON s.chapter_id = c.chapter_id
        WHERE s.novel_id = $1 AND s.type = 'start'
        LIMIT 1
    `, novelID)

	var s models.Scene
	err := row.Scan(
		&s.SceneID, &s.ChapterID, &s.NovelID, &s.Title, &s.Content, &s.ImageURL, &s.Type, &s.Status,
		&endingTitle, &endingType, &endingDescription,
		&s.CreatedAt, &s.UpdatedAt,
		&s.NovelTitle, &s.ChapterTitle,
		&s.ChapterEpisode,
	)
	if err != nil {
		return nil, err
	}
	if endingTitle.Valid {
		s.EndingTitle = &endingTitle.String
	}
	if endingType.Valid {
		s.EndingType = &endingType.String
	}
	if endingDescription.Valid {
		s.EndingDescription = &endingDescription.String
	}

	return &s, nil
}

// GetScenesByChapterID ดึงฉากทั้งหมดในตอนนั้นๆ
func GetScenesByChapterID(db *sql.DB, chapterID int) ([]models.Scene, error) {
	rows, err := db.Query(`
		SELECT scene_id, chapter_id, novel_id, title, content, image_url, type, status, ending_title, ending_type, ending_description, created_at, updated_at
		FROM scenes
		WHERE chapter_id = $1
		ORDER BY scene_id ASC
	`, chapterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	scenes := []models.Scene{}
	for rows.Next() {
		var s models.Scene
		err := rows.Scan(&s.SceneID, &s.ChapterID, &s.NovelID, &s.Title, &s.Content, &s.ImageURL, &s.Type, &s.Status, &s.EndingTitle, &s.EndingType, &s.EndingDescription, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}
		choices, err := GetChoicesBySceneID(db, s.SceneID)
		if err != nil {
			return nil, err
		}
		s.Choices = choices

		scenes = append(scenes, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scenes, nil
}

// CreateScene บันทึกฉากใหม่
func CreateScene(db *sql.DB, scene models.Scene) (int, error) {
	var id int
	err := db.QueryRow(`
		INSERT INTO scenes (chapter_id, novel_id, title, content, image_url, type, status, ending_title, ending_type, ending_description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING scene_id
	`, scene.ChapterID, scene.NovelID, scene.Title, scene.Content, scene.ImageURL, scene.Type, scene.Status, scene.EndingTitle, scene.EndingType, scene.EndingDescription).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func UpdateScene(db *sql.DB, scene models.Scene) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	_, err = tx.Exec(`
		UPDATE scenes
		SET title = $1,
		    content = $2,
		    image_url = $3,
		    type = $4,
		    status = $5,
		    ending_title = $6,
		    ending_type = $7,
		    ending_description = $8,
		    updated_at = CURRENT_TIMESTAMP
		WHERE scene_id = $9
	`, scene.Title, scene.Content, scene.ImageURL, scene.Type, scene.Status, scene.EndingTitle, scene.EndingType, scene.EndingDescription, scene.SceneID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
		UPDATE chapters
		SET updated_at = CURRENT_TIMESTAMP
		WHERE chapter_id = (SELECT chapter_id FROM scenes WHERE scene_id = $1)
	`, scene.SceneID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func DeleteScene(db *sql.DB, sceneID int) error {
	_, err := db.Exec(`
		DELETE FROM scenes WHERE scene_id = $1
	`, sceneID)
	return err
}

// CountScenesInNovel นับจำนวนฉากทั้งหมดในนิยายเรื่องนี้ (ใช้สำหรับ Automate Type 'start')
func CountScenesInNovel(db *sql.DB, novelID int) (int, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM scenes WHERE novel_id = $1`, novelID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func GetIncomingChoiceCount(db *sql.DB, sceneID int) (int, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM choices WHERE to_scene_id = $1`, sceneID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func UpdateSceneTypeByID(db *sql.DB, sceneID int, typ string) error {
	_, err := db.Exec(`UPDATE scenes SET type = $1, updated_at = CURRENT_TIMESTAMP WHERE scene_id = $2`, typ, sceneID)
	return err
}

func (r *postgresSceneRepository) CheckSceneExists(chapterID int, title string) (bool, error) {
	var exists bool
	// เช็คว่าใน Chapter เดียวกัน มีฉากที่ชื่อซ้ำกันไหม
	query := `SELECT EXISTS(SELECT 1 FROM scenes WHERE chapter_id=$1 AND title=$2)`
	err := r.db.QueryRow(query, chapterID, title).Scan(&exists)
	return exists, err
}

func (r *postgresSceneRepository) GetNodesByNovelID(novelID int) ([]models.SceneNode, error) {
	query := `SELECT scene_id, title, type FROM scenes WHERE novel_id = $1`
	rows, err := r.db.Query(query, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.SceneNode
	for rows.Next() {
		var n models.SceneNode
		if err := rows.Scan(&n.ID, &n.Label, &n.Type); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return nodes, nil
}

func (r *postgresSceneRepository) GetEdgesByNovelID(novelID int) ([]models.SceneEdge, error) {
	query := `
		SELECT c.choice_id, c.from_scene_id, c.to_scene_id, c.label
		FROM choices c
		JOIN scenes s ON c.from_scene_id = s.scene_id
		WHERE s.novel_id = $1`
	rows, err := r.db.Query(query, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var edges []models.SceneEdge
	for rows.Next() {
		var e models.SceneEdge
		if err := rows.Scan(&e.ChoiceID, &e.FromID, &e.ToID, &e.Label); err != nil {
			return nil, err
		}
		edges = append(edges, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return edges, nil
}

func (r *postgresSceneRepository) GetEndingsByNovelIDForUser(novelID int, userID int) ([]models.EndingScene, error) {
	query := `
	SELECT s.scene_id, s.title, s.type,
	       s.ending_title, s.ending_type, s.ending_description,
	       CASE WHEN ue.id IS NOT NULL THEN true ELSE false END AS is_unlocked,
	       ue.reached_at
	FROM scenes s
	LEFT JOIN user_endings ue ON s.scene_id = ue.scene_id AND ue.user_id = $2
	WHERE s.novel_id = $1 AND s.type = 'ending'
	ORDER BY s.scene_id
	`

	rows, err := r.db.Query(query, novelID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var endings []models.EndingScene
	for rows.Next() {
		var ending models.EndingScene
		var endingTitle sql.NullString
		var endingType sql.NullString
		var endingDescription sql.NullString
		var reachedAt sql.NullTime
		if err := rows.Scan(&ending.SceneID, &ending.Title, &ending.Type,
			&endingTitle, &endingType, &endingDescription,
			&ending.IsUnlocked, &reachedAt); err != nil {
			return nil, err
		}

		if endingTitle.Valid {
			ending.EndingTitle = &endingTitle.String
		}
		if endingType.Valid {
			ending.EndingType = &endingType.String
		}
		if endingDescription.Valid {
			ending.EndingDescription = &endingDescription.String
		}
		if reachedAt.Valid {
			ending.UnlockedAt = &reachedAt.Time
		}

		endings = append(endings, ending)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return endings, nil
}

func (r *postgresSceneRepository) GetNodesByNovelIDForUser(novelID int, userID int) ([]models.SceneNode, error) {
	// ใช้ LEFT JOIN กับ user_scene_history เพื่อเช็คว่า User เคยมาที่นี่หรือยัง
	// 🎯 เพิ่มการดึง content, ending_title, ending_description สำหรับแสดงข้อมูลครบถ้วน
	query := `
		SELECT s.scene_id, s.title, s.type, c.title AS chapter_title, c.episode AS chapter_episode, s.content,
               s.ending_title, s.ending_description, s.node_x, s.node_y,
		       CASE WHEN LOWER(s.status) = 'published' AND LOWER(c.status) = 'published' THEN 'published' ELSE 'draft' END AS node_status,
               ROW_NUMBER() OVER (PARTITION BY s.chapter_id ORDER BY s.scene_id) AS scene_number_in_chapter,
		       CASE WHEN EXISTS (SELECT 1 FROM user_scene_history ush WHERE ush.scene_id = s.scene_id AND ush.user_id = $2)
		              OR EXISTS (SELECT 1 FROM user_endings ue WHERE ue.scene_id = s.scene_id AND ue.user_id = $2)
		            THEN true ELSE false END AS is_unlocked
        FROM scenes s
        LEFT JOIN chapters c ON s.chapter_id = c.chapter_id
        WHERE s.novel_id = $1`

	rows, err := r.db.Query(query, novelID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.SceneNode
	for rows.Next() {
		var n models.SceneNode
		var endingTitle sql.NullString
		var endingDesc sql.NullString
		var nodeX sql.NullFloat64
		var nodeY sql.NullFloat64

		if err := rows.Scan(&n.ID, &n.Title, &n.Type, &n.ChapterTitle, &n.ChapterEpisode, &n.Content,
			&endingTitle, &endingDesc, &nodeX, &nodeY, &n.Status, &n.SceneNumberInChapter, &n.IsUnlocked); err != nil {
			return nil, err
		}

		// 🎯 ใช้ title เป็น Label ด้วย (สำหรับแสดงในกราฟ)
		n.Label = n.Title

		if nodeX.Valid {
			n.NodeX = &nodeX.Float64
		}
		if nodeY.Valid {
			n.NodeY = &nodeY.Float64
		}

		// 🎯 ถ้าเป็น ending scene ให้เก็บ ending information
		if n.Type == "ending" && endingTitle.Valid {
			n.Label = endingTitle.String
		}

		nodes = append(nodes, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return nodes, nil
}

func (r *postgresSceneRepository) UpdateScenePosition(sceneID int, nodeX *float64, nodeY *float64) error {
	res, err := r.db.Exec(`
		UPDATE scenes
		SET node_x = $1, node_y = $2, updated_at = CURRENT_TIMESTAMP
		WHERE scene_id = $3
	`, nodeX, nodeY, sceneID)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}
