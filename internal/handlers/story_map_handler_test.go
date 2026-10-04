package handlers

import "testing"

func TestStoryTreeUserIDUsesAuthenticatedIdentity(t *testing.T) {
	if got := storyTreeUserID(42, true, false); got != 42 {
		t.Fatalf("expected authenticated user id 42, got %d", got)
	}
}

func TestStoryTreeUserIDDoesNotTrustAnonymousIdentity(t *testing.T) {
	if got := storyTreeUserID(42, false, false); got != 0 {
		t.Fatalf("expected anonymous request to use user id 0, got %d", got)
	}
}

func TestStoryTreeUserIDTreatsZeroIdentityAsAnonymous(t *testing.T) {
	if got := storyTreeUserID(0, true, false); got != 0 {
		t.Fatalf("expected zero identity to use user id 0, got %d", got)
	}
}

func TestStoryTreeUserIDDoesNotUseReadingHistoryForOwnerOrAdmin(t *testing.T) {
	if got := storyTreeUserID(42, true, true); got != 0 {
		t.Fatalf("expected owner or admin to use user id 0, got %d", got)
	}
}
