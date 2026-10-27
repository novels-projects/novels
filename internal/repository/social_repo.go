package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"novel-be/internal/models"
)

var ErrSelfFollow = errors.New("cannot follow yourself")

func AddLike(db *sql.DB, like models.Like) error {
	_, err := db.Exec(`
        INSERT INTO likes (user_id, novel_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, novel_id) DO NOTHING
    `, like.UserID, like.NovelID)
	return err
}

func RemoveLike(db *sql.DB, userID, novelID int) error {
	_, err := db.Exec(`
        DELETE FROM likes
        WHERE user_id = $1 AND novel_id = $2
    `, userID, novelID)
	return err
}

func IsLikeExists(db *sql.DB, userID, novelID int) (bool, error) {
	var count int
	err := db.QueryRow(`
        SELECT COUNT(1)
        FROM likes
        WHERE user_id = $1 AND novel_id = $2
    `, userID, novelID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func AddToBookshelf(db *sql.DB, userID, novelID int) error {
	_, err := db.Exec(`
        INSERT INTO bookshelves (user_id, novel_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, novel_id) DO NOTHING
    `, userID, novelID)
	return err
}

func RemoveFromBookshelf(db *sql.DB, userID, novelID int) error {
	_, err := db.Exec(`
        DELETE FROM bookshelves
        WHERE user_id = $1 AND novel_id = $2
    `, userID, novelID)
	return err
}

func GetBookshelfByUserID(db *sql.DB, userID int) ([]models.Novel, error) {
	rows, err := db.Query(`
		SELECT DISTINCT ON (n.novel_id)
		       n.novel_id, n.title, n.captions, n.introduction, n.cover_image,
		       CASE
				WHEN n.is_completed AND n.is_published THEN 'completed-published'
				WHEN n.is_completed THEN 'completed-draft'
				WHEN n.is_published THEN 'published'
				ELSE 'draft'
			END AS status,
		       n.is_published, n.is_completed,
		       n.author_id, n.views, n.created_at, n.updated_at,
		       (SELECT COUNT(*) FROM chapters ch WHERE ch.novel_id = n.novel_id) AS chapter_count,
		       (SELECT COUNT(*) FROM scenes s WHERE s.novel_id = n.novel_id) AS scene_count,
		       w.name_lastname, w.pen_name,
		       (SELECT COALESCE(COUNT(*), 0) FROM likes l WHERE l.novel_id = n.novel_id) AS like_count,
		       (SELECT COALESCE(COUNT(*), 0) FROM bookshelves b WHERE b.novel_id = n.novel_id) AS bookshelf_count,
		       COALESCE(rp.current_scene_id, 0) AS current_scene_id,
		       0 AS visited_count,
		       (SELECT COALESCE(COUNT(*), 0) FROM user_endings ue JOIN scenes s ON s.scene_id = ue.scene_id WHERE ue.user_id = $1 AND s.novel_id = n.novel_id) AS ending_count,
		       (SELECT COALESCE(COUNT(*), 0) FROM scenes s2 WHERE s2.novel_id = n.novel_id) AS total_scenes,
		       0 AS last_read_scene_id,
		       '' AS last_read_scene_title,
		       CURRENT_TIMESTAMP AS last_read_at,
		       COALESCE(
			(SELECT json_agg(json_build_object('category_id', c.category_id, 'name', c.name)) 
			 FROM novel_categories nc2
			 LEFT JOIN categories c ON nc2.category_id = c.category_id
			 WHERE nc2.novel_id = n.novel_id), '[]'::json
		) AS categories_json
		FROM bookshelves bs
		JOIN novels n ON n.novel_id = bs.novel_id
		LEFT JOIN writers w ON n.author_id = w.writer_id
		LEFT JOIN reading_progress rp ON rp.user_id = bs.user_id AND rp.novel_id = n.novel_id AND rp.updated_at IS NOT NULL
		WHERE bs.user_id = $1
		ORDER BY n.novel_id, bs.created_at DESC
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
		if err := rows.Scan(&n.ID, &n.Title, &n.Captions, &n.Introduction, &n.CoverImage, &n.Status, &n.IsPublished, &n.IsCompleted,
			&n.AuthorID, &n.Views, &n.CreatedAt, &n.UpdatedAt,
			&n.ChapterCount, &n.SceneCount,
			&authorName, &penName,
			&n.LikeCount, &n.BookshelfCount,
			&n.CurrentSceneID, &n.VisitedCount, &n.EndingCount, &n.TotalScenes,
			&n.LastReadSceneID, &n.LastReadSceneTitle, &n.LastReadAt,
			&categoriesJSON); err != nil {
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
		novels = append(novels, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return novels, nil
}

func GetBookshelfCountByNovelID(db *sql.DB, novelID int) (int, error) {
	var count int
	err := db.QueryRow(`
        SELECT COUNT(*)
        FROM bookshelves
        WHERE novel_id = $1
    `, novelID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func GetBookshelfCountsByAuthorID(db *sql.DB, authorID int) ([]models.Novel, error) {
	rows, err := db.Query(`
        SELECT n.novel_id, n.title, COALESCE(COUNT(b.user_id), 0) AS bookshelf_count
        FROM novels n
        LEFT JOIN bookshelves b ON n.novel_id = b.novel_id
        WHERE n.author_id = $1
        GROUP BY n.novel_id, n.title
        ORDER BY n.created_at DESC
    `, authorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var novels []models.Novel
	for rows.Next() {
		var n models.Novel
		if err := rows.Scan(&n.ID, &n.Title, &n.BookshelfCount); err != nil {
			return nil, err
		}
		novels = append(novels, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return novels, nil
}

func AddComment(db *sql.DB, comment models.Comment) (int, error) {
	var id int
	err := db.QueryRow(`
        INSERT INTO comments (user_id, novel_id, scene_id, content)
        VALUES ($1, $2, $3, $4)
        RETURNING comment_id
    `, comment.UserID, comment.NovelID, comment.SceneID, comment.Content).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func RemoveComment(db *sql.DB, commentID, userID int) error {
	res, err := db.Exec(`
        DELETE FROM comments
        WHERE comment_id = $1 AND user_id = $2
    `, commentID, userID)
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

func AddFollow(db *sql.DB, follow models.Follow) error {
	// Normalize following ID: prefer exact writer_id match, otherwise try matching user_id
	var resolvedWriterID, targetUserID int
	// try direct writer_id match first
	err := db.QueryRow(`
		SELECT writer_id, user_id FROM writers WHERE writer_id = $1 LIMIT 1
	`, follow.FollowingID).Scan(&resolvedWriterID, &targetUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// try matching by user_id (must be approved writer)
			err = db.QueryRow(`
				SELECT writer_id, user_id FROM writers WHERE user_id = $1 AND status = 'approved' ORDER BY applied_at DESC LIMIT 1
			`, follow.FollowingID).Scan(&resolvedWriterID, &targetUserID)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return sql.ErrNoRows
				}
				return err
			}
		} else {
			return err
		}
	}
	if follow.FollowerID == targetUserID {
		return ErrSelfFollow
	}

	res, err := db.Exec(`
		INSERT INTO follows (follower_id, following_id)
		VALUES ($1, $2)
		ON CONFLICT (follower_id, following_id) DO NOTHING
	`, follow.FollowerID, resolvedWriterID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	log.Printf("AddFollow: follower=%d following_resolved=%d rows_affected=%d", follow.FollowerID, resolvedWriterID, rows)
	return nil
}

func RemoveFollow(db *sql.DB, userID, writerID int) error {
	// Resolve writerID: prefer writer_id match, otherwise try user_id
	var resolvedWriterID int
	err := db.QueryRow(`
		SELECT writer_id FROM writers WHERE writer_id = $1 LIMIT 1
	`, writerID).Scan(&resolvedWriterID)
	if err != nil {
		if err == sql.ErrNoRows {
			err = db.QueryRow(`
				SELECT writer_id FROM writers WHERE user_id = $1 AND status = 'approved' ORDER BY applied_at DESC LIMIT 1
			`, writerID).Scan(&resolvedWriterID)
			if err != nil {
				if err == sql.ErrNoRows {
					// nothing to delete
					return nil
				}
				return err
			}
		} else {
			return err
		}
	}

	_, err = db.Exec(`
		DELETE FROM follows
		WHERE follower_id = $1 AND following_id = $2
	`, userID, resolvedWriterID)
	return err
}

func GetFollowingWriters(db *sql.DB, userID int) ([]models.Writer, error) {
	rows, err := db.Query(`
        SELECT w.writer_id,
               w.user_id,
               w.name_lastname,
               w.pen_name,
               w.bio,
               w.email_writer,
               w.contact_info,
               w.avatar_url,
               w.status,
               COALESCE((SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = w.writer_id), 0) AS follower_count,
               COALESCE((SELECT COUNT(*) FROM novels n WHERE n.author_id = w.writer_id AND n.is_published = TRUE), 0) AS novel_count,
               COALESCE(json_agg(json_build_object(
                   'id', n.novel_id,
                   'title', n.title,
                   'status', CASE
                       WHEN n.is_completed AND n.is_published THEN 'finished'
                       WHEN n.is_published THEN 'ongoing'
                       ELSE 'draft'
                   END,
                   'cover', n.cover_image,
                   'chapter_count', (SELECT COUNT(*) FROM chapters ch WHERE ch.novel_id = n.novel_id)
               )) FILTER (WHERE n.novel_id IS NOT NULL), '[]') AS novels_json,
               (SELECT json_build_object(
                   'title', n2.title,
                   'detail', CONCAT('เพิ่มตอนที่ ', COALESCE((SELECT COUNT(*) FROM chapters ch WHERE ch.novel_id = n2.novel_id), 0)),
                   'time', to_char(n2.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
               )
                FROM novels n2
                WHERE n2.author_id = w.writer_id AND n2.is_published = TRUE
                ORDER BY n2.updated_at DESC
                LIMIT 1
               ) AS latest_update_json
        FROM follows f
        JOIN writers w ON w.writer_id = f.following_id
        LEFT JOIN novels n ON n.author_id = w.writer_id AND n.is_published = TRUE
        WHERE f.follower_id = $1 AND w.status = 'approved'
        GROUP BY w.writer_id, w.user_id, w.name_lastname, w.pen_name, w.bio, w.email_writer, w.contact_info, w.avatar_url, w.status
        ORDER BY w.pen_name ASC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	writers := []models.Writer{}
	for rows.Next() {
		var writer models.Writer
		var bio, emailWriter, contactInfo, avatarURL, status sql.NullString
		var followerCount, novelCount int
		var novelsJSON, latestUpdateJSON []byte
		if err := rows.Scan(&writer.WriterID, &writer.UserID, &writer.NameLastname, &writer.PenName, &bio, &emailWriter, &contactInfo, &avatarURL, &status, &followerCount, &novelCount, &novelsJSON, &latestUpdateJSON); err != nil {
			return nil, err
		}
		if bio.Valid {
			writer.Bio = &bio.String
		}
		if emailWriter.Valid {
			writer.EmailWriter = &emailWriter.String
		}
		if contactInfo.Valid {
			writer.ContactInfo = contactInfo.String
		}
		if avatarURL.Valid {
			writer.AvatarURL = avatarURL.String
		}
		if status.Valid {
			writer.Status = status.String
		}
		writer.FollowerCount = followerCount
		writer.NovelCount = novelCount
		if len(novelsJSON) > 0 {
			if err := json.Unmarshal(novelsJSON, &writer.Novels); err != nil {
				return nil, err
			}
		}
		if len(latestUpdateJSON) > 0 && string(latestUpdateJSON) != "null" {
			var latest models.LatestUpdate
			if err := json.Unmarshal(latestUpdateJSON, &latest); err != nil {
				return nil, err
			}
			writer.LatestUpdate = &latest
		}
		writers = append(writers, writer)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return writers, nil
}

func GetCommentCountByNovelID(db *sql.DB, novelID int) (int, error) {
	var count int
	err := db.QueryRow(`
        SELECT COUNT(*)
        FROM comments c
        WHERE c.novel_id = $1
    `, novelID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func GetCommentsByNovelID(db *sql.DB, novelID int) ([]models.Comment, error) {
	rows, err := db.Query(`
        SELECT c.comment_id, c.user_id, c.novel_id, c.scene_id, c.content, c.created_at, u.username
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.user_id
        WHERE c.novel_id = $1
          AND c.scene_id IS NULL
        ORDER BY c.created_at DESC
    `, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := []models.Comment{}
	for rows.Next() {
		var c models.Comment
		err := rows.Scan(&c.CommentID, &c.UserID, &c.NovelID, &c.SceneID, &c.Content, &c.CreatedAt, &c.Username)
		if err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return comments, nil
}

func GetCommentsBySceneID(db *sql.DB, sceneID int) ([]models.Comment, error) {
	rows, err := db.Query(`
        SELECT c.comment_id, c.user_id, c.novel_id, c.scene_id, c.content, c.created_at, u.username
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.user_id
        WHERE c.scene_id = $1
        ORDER BY c.created_at DESC
    `, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := []models.Comment{}
	for rows.Next() {
		var c models.Comment
		err := rows.Scan(&c.CommentID, &c.UserID, &c.NovelID, &c.SceneID, &c.Content, &c.CreatedAt, &c.Username)
		if err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return comments, nil
}
