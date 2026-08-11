package callstore

import (
	"context"
	"testing"
	"time"
)

func mustSave(t *testing.T, st *Store, entries ...Entry) {
	t.Helper()
	if _, err := st.SaveEntries(context.Background(), entries); err != nil {
		t.Fatalf("SaveEntries: %v", err)
	}
}

func entryAt(apiKey, internal string, ts time.Time, tokens Tokens) Entry {
	return Entry{
		RequestID:     apiKey + "/" + internal + "/" + ts.Format(time.RFC3339Nano),
		Timestamp:     ts,
		Endpoint:      "POST /v1/messages",
		APIKey:        apiKey,
		Alias:         internal,
		Provider:      "p",
		ProviderType:  "anthropic",
		Model:         internal,
		InternalModel: internal,
		HTTPStatus:    200,
		Tokens:        tokens,
	}
}

func TestUsageByKeyByModelORMatchCombinesNameAndValue(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	now := time.Now()
	// call_logs may key on the name OR the raw value; both must be summed.
	mustSave(t, st,
		entryAt("Claude Code", "claude/sonnet4", now.Add(-time.Minute), Tokens{InputTokens: 100, OutputTokens: 200, TotalTokens: 300}),
		entryAt("sk-abc", "claude/sonnet4", now.Add(-time.Minute), Tokens{InputTokens: 10, OutputTokens: 20, TotalTokens: 30}),
	)

	got, err := st.UsageByKeyByModel(ctx, DedupeIdentifiers("Claude Code", "sk-abc"), now.Add(-time.Hour).UnixMilli())
	if err != nil {
		t.Fatalf("UsageByKeyByModel: %v", err)
	}
	if len(got) != 1 || got[0].InternalModel != "claude/sonnet4" {
		t.Fatalf("expected 1 grouped model, got %+v", got)
	}
	if got[0].Tokens.InputTokens != 110 || got[0].Tokens.OutputTokens != 200+20 || got[0].Tokens.TotalTokens != 330 {
		t.Fatalf("token sums not combined: %+v", got[0].Tokens)
	}
}

func TestUsageByKeyByModelRespectsSinceMs(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	now := time.Now()
	mustSave(t, st,
		entryAt("k", "p/a", now.Add(-3*time.Hour), Tokens{InputTokens: 1000, TotalTokens: 1000}),
		entryAt("k", "p/a", now.Add(-time.Minute), Tokens{InputTokens: 50, TotalTokens: 50}),
	)
	got, err := st.UsageByKeyByModel(ctx, []string{"k"}, now.Add(-time.Hour).UnixMilli())
	if err != nil {
		t.Fatalf("UsageByKeyByModel: %v", err)
	}
	if len(got) != 1 || got[0].Tokens.InputTokens != 50 {
		t.Fatalf("windowing failed: %+v", got)
	}
}

func TestUsageByKeyByModelEmptyIdentifiers(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	got, err := st.UsageByKeyByModel(context.Background(), nil, 0)
	if err != nil {
		t.Fatalf("UsageByKeyByModel nil ids: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty, got %+v", got)
	}
}

func TestCostMissingPriceIsZero(t *testing.T) {
	sums := []PerModelUsage{{InternalModel: "p/a", Tokens: TokenSums{InputTokens: 1_000_000, OutputTokens: 1_000_000}}}
	if got := Cost(sums, map[string]ModelPrice{}); got != 0 {
		t.Fatalf("Cost with missing price = %v, want 0", got)
	}
}

func TestCostAppliesAllSixFields(t *testing.T) {
	// 1M tokens of each category at price 2 => 2 credits each => 12 total.
	sums := []PerModelUsage{{InternalModel: "p/a", Tokens: TokenSums{
		InputTokens: 1_000_000, OutputTokens: 1_000_000, CacheReadTokens: 1_000_000,
		CacheCreationTokens: 1_000_000, CachedTokens: 1_000_000, ReasoningTokens: 1_000_000,
	}}}
	prices := map[string]ModelPrice{"p/a": {InternalModel: "p/a", InputPrice: 2, OutputPrice: 2,
		CacheReadPrice: 2, CacheCreationPrice: 2, CachedPrice: 2, ReasoningPrice: 2}}
	if got := Cost(sums, prices); got != 12 {
		t.Fatalf("Cost = %v, want 12", got)
	}
}

func TestRecentByKeyLimitsAndOrders(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	now := time.Now()
	mustSave(t, st,
		entryAt("k", "p/a", now.Add(-1*time.Minute), Tokens{TotalTokens: 1}),
		entryAt("k", "p/a", now.Add(-2*time.Minute), Tokens{TotalTokens: 2}),
		entryAt("k", "p/a", now.Add(-3*time.Minute), Tokens{TotalTokens: 3}),
		entryAt("other", "p/a", now.Add(-time.Minute), Tokens{TotalTokens: 99}), // different key, excluded
	)
	got, err := st.RecentByKey(ctx, []string{"k"}, 2)
	if err != nil {
		t.Fatalf("RecentByKey: %v", err)
	}
	if len(got) != 2 || got[0].Tokens.TotalTokens != 1 || got[1].Tokens.TotalTokens != 2 {
		t.Fatalf("expected newest two for k in DESC order, got %+v", got)
	}
}
