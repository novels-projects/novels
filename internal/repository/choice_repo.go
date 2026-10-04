package repository

import (
	"database/sql"
	"novel-be/internal/models"
)

type postgresChoiceMutationRepository struct {
	tx *sql.Tx
}

func (r *postgresChoiceMutationRepository) GetSceneByID(id int) (*models.Scene, error) {
	var scene models.Scene
	err := r.tx.QueryRow(`
		SELECT scene_id, novel_id, type
		FROM scenes
		WHERE scene_id = $1
	`, id).Scan(&scene.SceneID, &scene.NovelID, &scene.Type)
	if err != nil {
		return nil, err
	}
	return &scene, nil
}

func (r *postgresChoiceMutationRepository) GetChoicesBySceneID(sceneID int) ([]models.Choice, error) {
	rows, err := r.tx.Query(`
		SELECT choice_id, from_scene_id, to_scene_id, label
		FROM choices
		WHERE from_scene_id = $1
		ORDER BY choice_id ASC
	`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	choices := []models.Choice{}
	for rows.Next() {
		var choice models.Choice
		if err := rows.Scan(&choice.ChoiceID, &choice.FromSceneID, &choice.ToSceneID, &choice.Label); err != nil {
			return nil, err
		}
		choices = append(choices, choice)
	}
	return choices, rows.Err()
}

func (r *postgresChoiceMutationRepository) GetChoiceByID(choiceID int) (*models.Choice, error) {
	var choice models.Choice
	err := r.tx.QueryRow(`
		SELECT choice_id, from_scene_id, to_scene_id, label
		FROM choices
		WHERE choice_id = $1
	`, choiceID).Scan(&choice.ChoiceID, &choice.FromSceneID, &choice.ToSceneID, &choice.Label)
	if err != nil {
		return nil, err
	}
	return &choice, nil
}

func (r *postgresChoiceMutationRepository) CreateChoice(choice models.Choice) (int, error) {
	var id int
	err := r.tx.QueryRow(`
		INSERT INTO choices (from_scene_id, to_scene_id, label)
		VALUES ($1, $2, $3)
		RETURNING choice_id
	`, choice.FromSceneID, choice.ToSceneID, choice.Label).Scan(&id)
	return id, err
}

func (r *postgresChoiceMutationRepository) UpdateChoice(choice models.Choice) error {
	_, err := r.tx.Exec(`
		UPDATE choices
		SET to_scene_id = $1, label = $2
		WHERE choice_id = $3
	`, choice.ToSceneID, choice.Label, choice.ChoiceID)
	return err
}

func (r *postgresChoiceMutationRepository) DeleteChoice(choiceID int) error {
	_, err := r.tx.Exec(`DELETE FROM choices WHERE choice_id = $1`, choiceID)
	return err
}

func (r *postgresChoiceMutationRepository) CheckChoiceExists(fromID, toID int, label string) (bool, error) {
	var exists bool
	err := r.tx.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM choices
			WHERE from_scene_id = $1 AND to_scene_id = $2 AND label = $3
		)
	`, fromID, toID, label).Scan(&exists)
	return exists, err
}

func (r *postgresChoiceMutationRepository) GetEdgesByNovelID(novelID int) ([]models.SceneEdge, error) {
	rows, err := r.tx.Query(`
		SELECT c.choice_id, c.from_scene_id, c.to_scene_id, c.label
		FROM choices c
		JOIN scenes s ON c.from_scene_id = s.scene_id
		WHERE s.novel_id = $1
	`, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	edges := []models.SceneEdge{}
	for rows.Next() {
		var edge models.SceneEdge
		if err := rows.Scan(&edge.ChoiceID, &edge.FromID, &edge.ToID, &edge.Label); err != nil {
			return nil, err
		}
		edges = append(edges, edge)
	}
	return edges, rows.Err()
}

func GetChoicesBySceneID(db *sql.DB, sceneID int) ([]models.Choice, error) {
	rows, err := db.Query(`
		SELECT 
			c.choice_id, c.from_scene_id, c.to_scene_id, c.label,
			COALESCE((ts.status = 'published' AND ch.status = 'published' AND n.is_published = true), false) AS is_published
		FROM choices c
		LEFT JOIN scenes ts ON c.to_scene_id = ts.scene_id
		LEFT JOIN chapters ch ON ts.chapter_id = ch.chapter_id
		LEFT JOIN novels n ON ts.novel_id = n.novel_id
		WHERE c.from_scene_id = $1
		ORDER BY c.choice_id ASC
	`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	choices := []models.Choice{}
	for rows.Next() {
		var c models.Choice
		var isPub bool
		err := rows.Scan(&c.ChoiceID, &c.FromSceneID, &c.ToSceneID, &c.Label, &isPub)
		if err != nil {
			return nil, err
		}
		c.IsPublished = &isPub
		choices = append(choices, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return choices, nil
}

func CreateChoice(db *sql.DB, choice models.Choice) (int, error) {
	var id int
	err := db.QueryRow(`
        INSERT INTO choices (from_scene_id, to_scene_id, label)
        VALUES ($1, $2, $3)
        RETURNING choice_id
    `, choice.FromSceneID, choice.ToSceneID, choice.Label).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func UpdateChoice(db *sql.DB, choice models.Choice) error {
	_, err := db.Exec(`
        UPDATE choices
        SET to_scene_id = $1,
            label = $2
        WHERE choice_id = $3
    `, choice.ToSceneID, choice.Label, choice.ChoiceID)
	return err
}

func DeleteChoice(db *sql.DB, id int) error {
	_, err := db.Exec(`
        DELETE FROM choices
        WHERE choice_id = $1
    `, id)
	return err
}

func GetChoiceByID(db *sql.DB, id int) (*models.Choice, error) {
	var c models.Choice
	err := db.QueryRow(`
        SELECT choice_id, from_scene_id, to_scene_id, label
        FROM choices
        WHERE choice_id = $1
    `, id).Scan(&c.ChoiceID, &c.FromSceneID, &c.ToSceneID, &c.Label)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *postgresSceneRepository) CheckChoiceExists(fromID, toID int, label string) (bool, error) {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM choices WHERE from_scene_id=$1 AND to_scene_id=$2 AND label=$3)`
	err := r.db.QueryRow(query, fromID, toID, label).Scan(&exists)
	return exists, err
}
