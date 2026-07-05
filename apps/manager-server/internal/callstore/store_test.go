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

func TestStoreUsageAggregatesPersistedEntries(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()

	base := Entry{
		RequestID:      "req_1",
		Timestamp:      time.Date(2026, 7, 5, 1, 2, 3, 0, time.UTC),
		Endpoint:       "POST /v1/messages",
		APIKey:         "Claude Code",
		SourceProtocol: "anthropic",
		Alias:          "claude",
		Provider:       "anthropic-main",
		ProviderType:   "anthropic",
		Model:          "claude-sonnet-4",
		InternalModel:  "anthropic-main/sonnet4",
		HTTPStatus:     200,
		Tokens: Tokens{
			InputTokens:         10,
			OutputTokens:        20,
			CacheReadTokens:     30,
			CacheCreationTokens: 40,
			CachedTokens:        50,
			ReasoningTokens:     60,
			TotalTokens:         210,
		},
	}
	failed := base
	failed.RequestID = "req_2"
	failed.Timestamp = base.Timestamp.Add(time.Second)
	failed.HTTPStatus = 529
	failed.Failed = true
	failed.Tokens = Tokens{InputTokens: 2, TotalTokens: 2}
	if _, err := st.SaveEntries(context.Background(), []Entry{base, failed}); err != nil {
		t.Fatalf("SaveEntries() error = %v", err)
	}

	items, err := st.Usage(context.Background())
	if err != nil {
		t.Fatalf("Usage() error = %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(items))
	}
	ok := items[0]
	if ok.HTTPStatus != 200 {
		t.Fatalf("first HTTPStatus = %d, want 200", ok.HTTPStatus)
	}
	if ok.AliasA != "sonnet4" {
		t.Fatalf("AliasA = %q, want sonnet4", ok.AliasA)
	}
	if ok.Requests != 1 || ok.Failures != 0 {
		t.Fatalf("ok requests/failures = %d/%d, want 1/0", ok.Requests, ok.Failures)
	}
	if ok.InputTokens != 10 || ok.OutputTokens != 20 || ok.CacheReadTokens != 30 ||
		ok.CacheCreationTokens != 40 || ok.CachedTokens != 50 || ok.ReasoningTokens != 60 ||
		ok.TotalTokens != 210 {
		t.Fatalf("unexpected token aggregate: %+v", ok)
	}
	gotFailed := items[1]
	if gotFailed.HTTPStatus != 529 || gotFailed.Requests != 1 || gotFailed.Failures != 1 {
		t.Fatalf("failed row = status %d requests %d failures %d, want 529/1/1",
			gotFailed.HTTPStatus, gotFailed.Requests, gotFailed.Failures)
	}
}
