package service

import (
	"errors"
	"sync"
	"testing"

	"novel-be/internal/models"
	"novel-be/internal/repository"
)

type choiceIntegrityRepo struct {
	mu            sync.Mutex
	scenes        map[int]*models.Scene
	choicesByFrom map[int][]models.Choice
	edges         []models.SceneEdge
	updated       *models.Choice
	created       *models.Choice
	lockedNovels  []int
	deletedChoice []int
}

func (r *choiceIntegrityRepo) WithNovelGraphMutation(novelID int, mutate func(repository.ChoiceMutationRepository) error) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lockedNovels = append(r.lockedNovels, novelID)
	previousEdges := append([]models.SceneEdge(nil), r.edges...)
	if err := mutate(r); err != nil {
		r.edges = previousEdges
		return err
	}
	return nil
}

func (r *choiceIntegrityRepo) GetSceneByID(id int) (*models.Scene, error) {
	scene, ok := r.scenes[id]
	if !ok {
		return nil, errors.New("scene not found")
	}
	return scene, nil
}
func (r *choiceIntegrityRepo) GetStartSceneByNovelID(int) (*models.Scene, error) {
	return nil, errors.New("not implemented")
}
func (r *choiceIntegrityRepo) GetChoicesBySceneID(id int) ([]models.Choice, error) {
	return r.choicesByFrom[id], nil
}
func (r *choiceIntegrityRepo) GetChoiceByID(id int) (*models.Choice, error) {
	for _, choices := range r.choicesByFrom {
		for _, choice := range choices {
			if choice.ChoiceID == id {
				copy := choice
				return &copy, nil
			}
		}
	}
	return nil, errors.New("choice not found")
}
func (r *choiceIntegrityRepo) GetScenesByChapterID(int) ([]models.Scene, error) { return nil, nil }
func (r *choiceIntegrityRepo) CreateScene(models.Scene) (int, error) {
	return 0, errors.New("not implemented")
}
func (r *choiceIntegrityRepo) UpdateScene(models.Scene) error { return nil }
func (r *choiceIntegrityRepo) DeleteScene(int) error          { return nil }
func (r *choiceIntegrityRepo) CreateChoice(choice models.Choice) (int, error) {
	choice.ChoiceID = 1000 + len(r.edges)
	r.created = &choice
	r.edges = append(r.edges, models.SceneEdge{
		ChoiceID: choice.ChoiceID,
		FromID:   choice.FromSceneID,
		ToID:     choice.ToSceneID,
		Label:    choice.Label,
	})
	return choice.ChoiceID, nil
}
func (r *choiceIntegrityRepo) UpdateChoice(choice models.Choice) error {
	r.updated = &choice
	for index, edge := range r.edges {
		if edge.ChoiceID == choice.ChoiceID {
			r.edges[index].ToID = choice.ToSceneID
			r.edges[index].Label = choice.Label
		}
	}
	return nil
}
func (r *choiceIntegrityRepo) DeleteChoice(choiceID int) error {
	r.deletedChoice = append(r.deletedChoice, choiceID)
	for fromID, choices := range r.choicesByFrom {
		for index, choice := range choices {
			if choice.ChoiceID == choiceID {
				r.choicesByFrom[fromID] = append(choices[:index], choices[index+1:]...)
				break
			}
		}
	}
	for index, edge := range r.edges {
		if edge.ChoiceID == choiceID {
			r.edges = append(r.edges[:index], r.edges[index+1:]...)
			break
		}
	}
	return nil
}
func (r *choiceIntegrityRepo) CountScenesInNovel(int) (int, error)     { return 0, nil }
func (r *choiceIntegrityRepo) GetIncomingChoiceCount(int) (int, error) { return 0, nil }
func (r *choiceIntegrityRepo) UpdateSceneTypeByID(int, string) error   { return nil }
func (r *choiceIntegrityRepo) CheckChoiceExists(fromID, toID int, label string) (bool, error) {
	for _, edge := range r.edges {
		if edge.FromID == fromID && edge.ToID == toID && edge.Label == label {
			return true, nil
		}
	}
	return false, nil
}
func (r *choiceIntegrityRepo) CheckSceneExists(int, string) (bool, error)        { return false, nil }
func (r *choiceIntegrityRepo) GetNodesByNovelID(int) ([]models.SceneNode, error) { return nil, nil }
func (r *choiceIntegrityRepo) GetNodesByNovelIDForUser(int, int) ([]models.SceneNode, error) {
	return nil, nil
}
func (r *choiceIntegrityRepo) GetEdgesByNovelID(int) ([]models.SceneEdge, error) { return r.edges, nil }
func (r *choiceIntegrityRepo) GetEndingsByNovelIDForUser(int, int) ([]models.EndingScene, error) {
	return nil, nil
}
func (r *choiceIntegrityRepo) UpdateScenePosition(int, *float64, *float64) error { return nil }

func newChoiceIntegrityService() (*sceneService, *choiceIntegrityRepo) {
	repo := &choiceIntegrityRepo{
		scenes: map[int]*models.Scene{
			1: {SceneID: 1, NovelID: 10, Type: "normal"},
			2: {SceneID: 2, NovelID: 10, Type: "normal"},
			3: {SceneID: 3, NovelID: 10, Type: "normal"},
			4: {SceneID: 4, NovelID: 20, Type: "normal"},
		},
		edges: []models.SceneEdge{
			{ChoiceID: 11, FromID: 1, ToID: 2, Label: "old"},
			{ChoiceID: 22, FromID: 2, ToID: 3, Label: "foreign"},
		},
		choicesByFrom: map[int][]models.Choice{
			1: {{ChoiceID: 11, FromSceneID: 1, ToSceneID: 2, Label: "old"}},
			2: {{ChoiceID: 22, FromSceneID: 2, ToSceneID: 3, Label: "foreign"}},
		},
	}
	return &sceneService{repo: repo}, repo
}

func TestSyncSceneChoicesRejectsChoiceOwnedByAnotherScene(t *testing.T) {
	svc, _ := newChoiceIntegrityService()
	_, err := svc.SyncSceneChoices(1, []interface{}{map[string]interface{}{
		"choice_id": float64(22), "label": "changed", "to_scene_id": float64(3),
	}})
	if err == nil {
		t.Fatal("expected foreign choice ownership validation error")
	}
}

func TestSyncSceneChoicesRejectsSelfLoop(t *testing.T) {
	svc, _ := newChoiceIntegrityService()
	_, err := svc.SyncSceneChoices(1, []interface{}{map[string]interface{}{
		"label": "loop", "to_scene_id": float64(1),
	}})
	if err == nil {
		t.Fatal("expected self-loop validation error")
	}
}

func TestUpdateChoiceRejectsSelfLoopAndCrossNovelTarget(t *testing.T) {
	svc, _ := newChoiceIntegrityService()
	if err := svc.UpdateChoice(models.Choice{ChoiceID: 11, ToSceneID: 1, Label: "loop"}); err == nil {
		t.Fatal("expected self-loop validation error")
	}
	if err := svc.UpdateChoice(models.Choice{ChoiceID: 11, ToSceneID: 4, Label: "cross novel"}); err == nil {
		t.Fatal("expected cross-novel validation error")
	}
}

func TestUpdateAndSyncChoiceAllowValidChanges(t *testing.T) {
	svc, repo := newChoiceIntegrityService()
	if err := svc.UpdateChoice(models.Choice{ChoiceID: 11, ToSceneID: 3, Label: "updated"}); err != nil {
		t.Fatalf("expected valid update, got %v", err)
	}
	if repo.updated == nil || repo.updated.FromSceneID != 1 || repo.updated.ToSceneID != 3 {
		t.Fatalf("unexpected updated choice: %+v", repo.updated)
	}

	_, err := svc.SyncSceneChoices(1, []interface{}{map[string]interface{}{
		"choice_id": float64(11), "label": "synced", "to_scene_id": float64(2),
	}})
	if err != nil {
		t.Fatalf("expected valid sync, got %v", err)
	}
	if repo.updated == nil || repo.updated.FromSceneID != 1 || repo.updated.Label != "synced" {
		t.Fatalf("unexpected synced choice: %+v", repo.updated)
	}
}

func TestCreateChoiceRejectsSequentialCycleAndAllowsValidEdge(t *testing.T) {
	repo := &choiceIntegrityRepo{
		scenes: map[int]*models.Scene{
			1: {SceneID: 1, NovelID: 10, Type: "normal"},
			2: {SceneID: 2, NovelID: 10, Type: "normal"},
			3: {SceneID: 3, NovelID: 10, Type: "normal"},
			4: {SceneID: 4, NovelID: 10, Type: "normal"},
		},
		edges: []models.SceneEdge{
			{ChoiceID: 1, FromID: 1, ToID: 2, Label: "a to b"},
			{ChoiceID: 2, FromID: 2, ToID: 3, Label: "b to c"},
		},
	}
	svc := &sceneService{repo: repo}

	if _, err := svc.CreateChoice(models.Choice{FromSceneID: 3, ToSceneID: 1, Label: "cycle"}); err == nil {
		t.Fatal("expected sequential cycle mutation to be rejected")
	}
	if _, err := svc.CreateChoice(models.Choice{FromSceneID: 3, ToSceneID: 4, Label: "valid"}); err != nil {
		t.Fatalf("expected valid edge mutation to succeed: %v", err)
	}
}

func TestConcurrentChoiceMutationsCannotCombineIntoCycle(t *testing.T) {
	repo := &choiceIntegrityRepo{
		scenes: map[int]*models.Scene{
			1: {SceneID: 1, NovelID: 10, Type: "normal"},
			2: {SceneID: 2, NovelID: 10, Type: "normal"},
			3: {SceneID: 3, NovelID: 10, Type: "normal"},
		},
		edges: []models.SceneEdge{{ChoiceID: 1, FromID: 1, ToID: 2, Label: "a to b"}},
	}
	svc := &sceneService{repo: repo}
	choices := []models.Choice{
		{FromSceneID: 2, ToSceneID: 3, Label: "b to c"},
		{FromSceneID: 3, ToSceneID: 1, Label: "c to a"},
	}
	start := make(chan struct{})
	results := make(chan error, len(choices))
	var ready sync.WaitGroup
	for _, choice := range choices {
		choice := choice
		ready.Add(1)
		go func() {
			ready.Done()
			<-start
			_, err := svc.CreateChoice(choice)
			results <- err
		}()
	}
	ready.Wait()
	close(start)

	succeeded := 0
	rejected := 0
	for range choices {
		if err := <-results; err != nil {
			rejected++
		} else {
			succeeded++
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("expected one concurrent mutation to succeed and one to be rejected, got succeeded=%d rejected=%d", succeeded, rejected)
	}

	for _, edge := range repo.edges {
		if svc.wouldCreateCycle(edge.FromID, edge.ToID, repo.edges) {
			t.Fatalf("combined concurrent mutations left a cycle at edge %d -> %d", edge.FromID, edge.ToID)
		}
	}
}

func TestUpdateChoiceRejectsCycleAndSyncRollsBackCycleMutation(t *testing.T) {
	repo := &choiceIntegrityRepo{
		scenes: map[int]*models.Scene{
			1: {SceneID: 1, NovelID: 10, Type: "normal"},
			2: {SceneID: 2, NovelID: 10, Type: "normal"},
			3: {SceneID: 3, NovelID: 10, Type: "normal"},
			4: {SceneID: 4, NovelID: 10, Type: "normal"},
		},
		choicesByFrom: map[int][]models.Choice{
			1: {{ChoiceID: 11, FromSceneID: 1, ToSceneID: 2, Label: "a to b"}},
			2: {{ChoiceID: 12, FromSceneID: 2, ToSceneID: 3, Label: "b to c"}},
			3: {{ChoiceID: 13, FromSceneID: 3, ToSceneID: 4, Label: "c to d"}},
		},
		edges: []models.SceneEdge{
			{ChoiceID: 11, FromID: 1, ToID: 2, Label: "a to b"},
			{ChoiceID: 12, FromID: 2, ToID: 3, Label: "b to c"},
			{ChoiceID: 13, FromID: 3, ToID: 4, Label: "c to d"},
		},
	}
	svc := &sceneService{repo: repo}
	if err := svc.UpdateChoice(models.Choice{ChoiceID: 13, ToSceneID: 1, Label: "cycle"}); err == nil {
		t.Fatal("expected UpdateChoice to reject a cycle")
	}

	before := append([]models.SceneEdge(nil), repo.edges...)
	_, err := svc.SyncSceneChoices(3, []interface{}{map[string]interface{}{
		"label": "cycle", "to_scene_id": float64(1),
	}})
	if err == nil {
		t.Fatal("expected SyncSceneChoices to reject a cycle")
	}
	if len(repo.edges) != len(before) {
		t.Fatalf("failed SyncSceneChoices should roll back all graph changes, before=%d after=%d", len(before), len(repo.edges))
	}
}

func TestDeleteChoiceUsesNovelMutationBoundaryAndDeletesOnlyRequestedChoice(t *testing.T) {
	svc, repo := newChoiceIntegrityService()
	repo.scenes[5] = &models.Scene{SceneID: 5, NovelID: 20, Type: "normal"}
	repo.choicesByFrom[5] = []models.Choice{{ChoiceID: 55, FromSceneID: 5, ToSceneID: 4, Label: "other novel"}}
	repo.edges = append(repo.edges, models.SceneEdge{ChoiceID: 55, FromID: 5, ToID: 4, Label: "other novel"})

	if err := svc.DeleteChoice(22); err != nil {
		t.Fatalf("DeleteChoice returned an error: %v", err)
	}
	if len(repo.lockedNovels) != 1 || repo.lockedNovels[0] != 10 {
		t.Fatalf("expected delete to use graph mutation boundary for novel 10, got %v", repo.lockedNovels)
	}
	if len(repo.deletedChoice) != 1 || repo.deletedChoice[0] != 22 {
		t.Fatalf("expected only choice 22 to be deleted, got %v", repo.deletedChoice)
	}
	otherNovelChoicePreserved := false
	for _, edge := range repo.edges {
		if edge.ChoiceID == 22 {
			t.Fatal("requested choice edge remained after DeleteChoice")
		}
		if edge.ChoiceID == 55 {
			otherNovelChoicePreserved = true
		}
	}
	if !otherNovelChoicePreserved {
		t.Fatal("choice from another novel was deleted")
	}
}
