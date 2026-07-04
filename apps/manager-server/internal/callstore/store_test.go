package callstore

import (
	"context"
	"testing"
	"time"
)

func TestStoreSaveEntriesRecentDedupesAndKeepsError(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()

	entry := Entry{
		RequestID:      "req_1",
		Timestamp:      time.Date(2026, 7, 5, 1, 2, 3, 0, time.UTC),
		Endpoint:       "POST /v1/messages",
		APIKey:         "Claude Code",
		SourceProtocol: "anthropic",
		Alias:          "GLM-Pro",
		Provider:       "claude",
		ProviderType:   "anthropic",
		Model:          "claude-opus-4-8",
		InternalModel:  "claude/GLM-Pro",
		HTTPStatus:     529,
		LatencyMS:      1234,
		Failed:         true,
		Error:          "upstream overloaded",
		Tokens: Tokens{
			InputTokens:     11,
			OutputTokens:    22,
			CacheReadTokens: 33,
			TotalTokens:     66,
		},
	}
	inserted, err := st.SaveEntries(context.Background(), []Entry{entry, entry})
	if err != nil {
		t.Fatalf("SaveEntries() error = %v", err)
	}
	if inserted != 1 {
		t.Fatalf("inserted = %d, want 1", inserted)
	}
	got, err := st.Recent(context.Background(), 10)
	if err != nil {
		t.Fatalf("Recent() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
	if got[0].Error != entry.Error {
		t.Fatalf("Error = %q, want %q", got[0].Error, entry.Error)
	}
	if !got[0].Failed {
		t.Fatalf("Failed = false, want true")
	}
	if got[0].Tokens.CacheReadTokens != entry.Tokens.CacheReadTokens {
		t.Fatalf("CacheReadTokens = %d, want %d", got[0].Tokens.CacheReadTokens, entry.Tokens.CacheReadTokens)
	}
}
