package repository

import (
	"context"
	"time"

	"novel-be/internal/dto"
	"novel-be/internal/models"
)

type NovelRepository interface {
	ListNovels() ([]models.Novel, error)
	ListAdminNovels(ctx context.Context, search, status string, categoryID, page, limit int) ([]models.Novel, int, error)
	GetNovelByID(id int) (*models.Novel, error)
	IncrementViews(novelID int) error
	GetNovelsByAuthorID(authorID int) ([]models.Novel, error)
	CreateNovel(models.Novel) (int, error)
	UpdateNovel(models.Novel) error
	UpdateCoverImage(id int, url string) error
	DeleteNovel(id int) error
	SuspendNovel(ctx context.Context, novelID int) error
	UnbanNovel(ctx context.Context, id int) error
}

type SceneRepository interface {
	WithNovelGraphMutation(novelID int, mutate func(ChoiceMutationRepository) error) error
	GetSceneByID(id int) (*models.Scene, error)
	GetStartSceneByNovelID(novelID int) (*models.Scene, error)
	GetChoicesBySceneID(id int) ([]models.Choice, error)
	GetChoiceByID(choiceID int) (*models.Choice, error)
	GetScenesByChapterID(chapterID int) ([]models.Scene, error)
	CreateScene(scene models.Scene) (int, error)
	UpdateScene(scene models.Scene) error
	DeleteScene(sceneID int) error
	CreateChoice(choice models.Choice) (int, error)
	UpdateChoice(choice models.Choice) error
	DeleteChoice(choiceID int) error
	CountScenesInNovel(novelID int) (int, error)
	GetIncomingChoiceCount(sceneID int) (int, error)
	UpdateSceneTypeByID(sceneID int, typ string) error
	CheckChoiceExists(fromID, toID int, label string) (bool, error)
	CheckSceneExists(chapterID int, title string) (bool, error)
	GetNodesByNovelID(novelID int) ([]models.SceneNode, error)
	GetNodesByNovelIDForUser(novelID int, userID int) ([]models.SceneNode, error)
	GetEdgesByNovelID(novelID int) ([]models.SceneEdge, error)
	GetEndingsByNovelIDForUser(novelID int, userID int) ([]models.EndingScene, error)
	UpdateScenePosition(sceneID int, nodeX *float64, nodeY *float64) error
}

type ChoiceMutationRepository interface {
	GetSceneByID(id int) (*models.Scene, error)
	GetChoicesBySceneID(sceneID int) ([]models.Choice, error)
	GetChoiceByID(choiceID int) (*models.Choice, error)
	CreateChoice(choice models.Choice) (int, error)
	UpdateChoice(choice models.Choice) error
	DeleteChoice(choiceID int) error
	CheckChoiceExists(fromID, toID int, label string) (bool, error)
	GetEdgesByNovelID(novelID int) ([]models.SceneEdge, error)
}

type ChapterRepository interface {
	GetChaptersByNovelID(novelID int) ([]models.Chapter, error)
	GetChapterByID(id int) (*models.Chapter, error)
	CreateChapter(models.Chapter) (int, error)
	UpdateChapter(models.Chapter) error
	DeleteChapter(chapterID int) error
	ReorderChapters(orderedIDs []int) error
}

type SocialRepository interface {
	AddLike(models.Like) error
	RemoveLike(userID, novelID int) error
	IsLikeExists(userID, novelID int) (bool, error)
	AddToBookshelf(userID, novelID int) error
	RemoveFromBookshelf(userID, novelID int) error
	GetBookshelfByUserID(userID int) ([]models.Novel, error)
	GetBookshelfCountByNovelID(novelID int) (int, error)
	GetBookshelfCountsByAuthorID(authorID int) ([]models.Novel, error)
	AddComment(models.Comment) (int, error)
	RemoveComment(commentID, userID int) error
	AddFollow(models.Follow) error
	RemoveFollow(userID, writerID int) error
	GetFollowingWriters(userID int) ([]models.Writer, error)
	GetCommentCountByNovelID(novelID int) (int, error)
	GetCommentsByNovelID(novelID int) ([]models.Comment, error)
	GetCommentsBySceneID(sceneID int) ([]models.Comment, error)
}

type ReadingRepository interface {
	GetReadingProgress(userID, novelID int) (*models.ReadingProgress, error)
	SaveReadingProgress(userID, novelID, sceneID int) error
	ResetReadingProgress(userID, novelID int) error
	GetReadingHistory(userID int) ([]models.Novel, error)
	InsertSceneHistory(userID, sceneID int) error
	InsertChoiceHistory(history models.ChoiceHistory) error
	InsertUserEnding(userID, novelID, sceneID int) error
	DeleteReadingHistoryByNovel(userID, novelID int) (bool, error)
	DeleteReadingHistoryByUser(userID int, novelIDs []int) (int, error)
}

type WriterRepository interface {
	GetWriterByID(id int) (*models.Writer, error)
	GetWriterByUserID(userID int) (*models.Writer, error)
	GetLatestWriterApplicationByUserID(userID int) (*models.Writer, error)
	GetUserRoleByUserID(userID int) (string, error)
	Apply(ctx context.Context, userID uint, req dto.WriterApplyRequest, contactJSON string) error
	GetPendingRequests(ctx context.Context, status string, page, limit int) ([]dto.WriterRequestResponse, error)
	ApproveWriter(ctx context.Context, writerID uint, adminID uint) error
	RejectWriter(ctx context.Context, writerID uint, adminID uint, rejectionReason string) error
	UpdateWriterProfile(ctx context.Context, writerID int, req dto.UpdateWriterProfileRequest, contactJSON string) error
}

type AuthRepository interface {
	CreateUser(ctx context.Context, user *models.User) error
	GetByUsername(ctx context.Context, username string) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, userID uint) (*models.User, error)
	ListUsers(ctx context.Context, role, status, search string, page, limit int) ([]dto.AdminUserListItemDTO, error)
	GetUserForAdmin(ctx context.Context, userID uint) (*dto.AdminUserDetailDTO, error)
	UpdateUserStatus(ctx context.Context, userID uint, status, reason string, suspendedAt *time.Time, adminID uint) error
	DemoteUserToReader(ctx context.Context, userID uint, adminID uint) error
	RestoreUserWriterAccess(ctx context.Context, userID uint, adminID uint) error
	DeleteUser(ctx context.Context, userID uint) error
	HasWriterNovels(ctx context.Context, userID uint) (bool, error)
	UpdateUsername(ctx context.Context, userID uint, username string) error
	UpdateEmail(ctx context.Context, userID uint, email string) error
	UpdatePassword(ctx context.Context, userID uint, passwordHash string) error
	UpdateProfilePicture(ctx context.Context, userID uint, picProfile string) error
	SuspendUser(ctx context.Context, userID uint, reason string) error
}
