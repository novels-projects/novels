package handlers

import "testing"

func TestStoryTreeUserIDUsesAuthenticatedIdentity(t *testing.T) {
	if got := storyTreeUserID(42, true); got != 42 {
		t.Fatalf("expected authenticated user id 42, got %d", got)
	}
}

func TestStoryTreeUserIDDoesNotTrustAnonymousIdentity(t *testing.T) {
	if got := storyTreeUserID(42, false); got != 0 {
		t.Fatalf("expected anonymous request to use user id 0, got %d", got)
	}
}

func TestStoryTreeUserIDTreatsZeroIdentityAsAnonymous(t *testing.T) {
	if got := storyTreeUserID(0, true); got != 0 {
		t.Fatalf("expected zero identity to use user id 0, got %d", got)
	}
}

func TestStoryTreeUserIDPreservesReaderProgressForOwnersAndAdmins(t *testing.T) {
	if got := storyTreeUserID(42, true); got != 42 {
		t.Fatalf("expected owner or admin reader view to use user id 42, got %d", got)
	}
}
