package service

import (
	"testing"

	"novel-be/internal/models"
)

func TestEvaluatePublishabilityAllowsNovelWithoutStartScene(t *testing.T) {
	result := evaluatePublishability(publishInput{
		sceneByID: map[int]sceneInfo{
			1: {sceneID: 1, chapterID: 2, sceneType: "normal", status: "draft"},
		},
		sceneIDs: []int{1},
		edges:    []models.SceneEdge{},
	})

	if !result.CanPublish {
		t.Fatal("novel without a start scene must remain publishable")
	}
	if len(result.Issues) != 1 {
		t.Fatalf("issues = %v, want only MISSING_START_SCENE warning", result.Issues)
	}
	if result.Issues[0].Code != "MISSING_START_SCENE" || result.Issues[0].Severity != "warning" {
		t.Fatalf("issue = %+v, want MISSING_START_SCENE warning", result.Issues[0])
	}
}
