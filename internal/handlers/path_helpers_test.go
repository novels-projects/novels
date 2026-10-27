package handlers

import "testing"

func TestExtractIDFromPath(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		prefix string
		want   int
	}{
		{
			name:   "legacy scene path",
			path:   "/scenes/126/position",
			prefix: "/scenes/",
			want:   126,
		},
		{
			name:   "versioned scene path",
			path:   "/api/v1/scenes/126/position",
			prefix: "/scenes/",
			want:   126,
		},
		{
			name:   "versioned novel path",
			path:   "/api/v1/novels/1/story-tree",
			prefix: "/novels/",
			want:   1,
		},
		{
			name:   "versioned writer analytics path",
			path:   "/api/v1/writer/novels/7/analytics",
			prefix: "/api/v1/writer/novels/",
			want:   7,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractIDFromPath(tt.path, tt.prefix)
			if err != nil {
				t.Fatalf("extractIDFromPath(%q, %q) returned error: %v", tt.path, tt.prefix, err)
			}
			if got != tt.want {
				t.Fatalf("extractIDFromPath(%q, %q) = %d, want %d", tt.path, tt.prefix, got, tt.want)
			}
		})
	}
}

func TestAdminUserIDFromPath(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		suffix string
		want   int
	}{
		{name: "versioned detail", path: "/api/v1/admin/users/17", want: 17},
		{name: "versioned status", path: "/api/v1/admin/users/18/status", suffix: "/status", want: 18},
		{name: "legacy alias detail", path: "/admin/users/19", want: 19},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := adminUserIDFromPath(tt.path, tt.suffix)
			if err != nil || got != tt.want {
				t.Fatalf("adminUserIDFromPath(%q, %q) = %d, %v; want %d, nil", tt.path, tt.suffix, got, err, tt.want)
			}
		})
	}
}

func TestExtractAdminNovelID(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		suffix string
		want   int
	}{
		{name: "versioned moderation", path: "/api/v1/admin/novels/23/moderation", suffix: "/moderation", want: 23},
		{name: "versioned unban", path: "/api/v1/admin/novels/24/unban", suffix: "/unban", want: 24},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractAdminNovelID(tt.path, tt.suffix)
			if err != nil || got != tt.want {
				t.Fatalf("extractAdminNovelID(%q, %q) = %d, %v; want %d, nil", tt.path, tt.suffix, got, err, tt.want)
			}
		})
	}
}

func TestExtractNovelIDFromPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want int
	}{
		{name: "versioned public novel route", path: "/api/v1/novels/31", want: 31},
		{name: "legacy public novel route", path: "/novels/32", want: 32},
		{name: "versioned writer novel route", path: "/api/v1/writer/novels/33/analytics", want: 33},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractNovelIDFromPath(tt.path)
			if err != nil || got != tt.want {
				t.Fatalf("extractNovelIDFromPath(%q) = %d, %v; want %d, nil", tt.path, got, err, tt.want)
			}
		})
	}
}

func TestExtractAdminIDFromPath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		resource string
		suffix   string
		want     int
	}{
		{name: "versioned category", path: "/api/v1/admin/categories/41", resource: "categories", want: 41},
		{name: "legacy category", path: "/api/admin/categories/42", resource: "categories", want: 42},
		{name: "versioned report status", path: "/api/v1/admin/reports/43/status", resource: "reports", suffix: "/status", want: 43},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractAdminIDFromPath(tt.path, tt.resource, tt.suffix)
			if err != nil || got != tt.want {
				t.Fatalf("extractAdminIDFromPath(%q, %q, %q) = %d, %v; want %d, nil", tt.path, tt.resource, tt.suffix, got, err, tt.want)
			}
		})
	}
}
