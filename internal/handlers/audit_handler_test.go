package handlers

import "testing"

func TestExtractAuditLogID(t *testing.T) {
	tests := []struct {
		name string
		path string
		want int64
	}{
		{
			name: "versioned admin route",
			path: "/api/v1/admin/audit-logs/602",
			want: 602,
		},
		{
			name: "legacy admin route",
			path: "/api/admin/audit-logs/602",
			want: 602,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractAuditLogID(tt.path)
			if err != nil {
				t.Fatalf("extractAuditLogID(%q) returned error: %v", tt.path, err)
			}
			if got != tt.want {
				t.Fatalf("extractAuditLogID(%q) = %d, want %d", tt.path, got, tt.want)
			}
		})
	}
}
