package service

import (
	"database/sql"
	"novel-be/internal/repository"
)

type sceneService struct {
	repo repository.SceneRepository
	db   *sql.DB
}

func NewSceneService(repo repository.SceneRepository, db *sql.DB) SceneService {
	return &sceneService{repo: repo, db: db}
}

func (s *sceneService) Ping() error {
	return s.db.Ping()
}
