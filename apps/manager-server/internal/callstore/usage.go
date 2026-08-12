package callstore

import (
	"context"
	"strings"
	"time"
)

// TokenSums is the per-window sum of each token category for a set of call logs.
type TokenSums struct {
	InputTokens         int64 `json:"input_tokens"`
	OutputTokens        int64 `json:"output_tokens"`
	CacheReadTokens     int64 `json:"cache_read_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_tokens"`
	CachedTokens        int64 `json:"cached_tokens"`
	ReasoningTokens     int64 `json:"reasoning_tokens"`
	TotalTokens         int64 `json:"total_tokens"`
}

// PerModelUsage groups token sums by internal_model within a window.
type PerModelUsage struct {
	InternalModel string    `json:"internal_model"`
	Tokens        TokenSums `json:"tokens"`
}

// DedupeIdentifiers returns the non-empty, de-duplicated identifiers for a
// usage control (typically [api_key_name, api_key_value]). call_logs.api_key
// may hold either the key name or its raw value, so matching against both
// makes usage tracking robust to that ambiguity.
func DedupeIdentifiers(values ...string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(values))
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func inPlaceholders(n int) string {
	if n <= 0 {
		return ""
	}
	parts := make([]string, n)
	for i := range parts {
		parts[i] = "?"
	}
	return strings.Join(parts, ", ")
}

// UsageByKeyByModel sums each token category per internal_model for call logs
// matching any identifier within the rolling window [sinceMs, now]. Returns an
// empty slice (no query) when identifiers is empty.
func (s *Store) UsageByKeyByModel(ctx context.Context, identifiers []string, sinceMs int64) ([]PerModelUsage, error) {
	if len(identifiers) == 0 {
		return []PerModelUsage{}, nil
	}
	args := make([]any, 0, len(identifiers)+1)
	args = append(args, sinceMs)
	for _, id := range identifiers {
		args = append(args, id)
	}
	query := `SELECT internal_model,
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(cache_read_tokens), 0),
			COALESCE(SUM(cache_creation_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(SUM(reasoning_tokens), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM call_logs
		WHERE timestamp_ms >= ? AND api_key IN (` + inPlaceholders(len(identifiers)) + `)
		GROUP BY internal_model
		ORDER BY internal_model ASC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PerModelUsage, 0)
	for rows.Next() {
		var item PerModelUsage
		if err := rows.Scan(
			&item.InternalModel,
			&item.Tokens.InputTokens,
			&item.Tokens.OutputTokens,
			&item.Tokens.CacheReadTokens,
			&item.Tokens.CacheCreationTokens,
			&item.Tokens.CachedTokens,
			&item.Tokens.ReasoningTokens,
			&item.Tokens.TotalTokens,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// EntriesByKey returns call-log entries matching any identifier within the
// rolling window [sinceMs, now], for billing (cost-with-multiplier) computation.
func (s *Store) EntriesByKey(ctx context.Context, identifiers []string, sinceMs int64, limit int) ([]Entry, error) {
	if len(identifiers) == 0 {
		return []Entry{}, nil
	}
	if limit <= 0 {
		limit = 50000
	}
	args := make([]any, 0, len(identifiers)+2)
	args = append(args, sinceMs)
	for _, id := range identifiers {
		args = append(args, id)
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, `SELECT
			request_id, timestamp, endpoint, api_key, source_protocol, alias, provider, provider_type,
			model, internal_model, http_status, latency_ms, failed, error, input_tokens, output_tokens,
			cache_read_tokens, cache_creation_tokens, cached_tokens, reasoning_tokens, total_tokens
		FROM call_logs
		WHERE timestamp_ms >= ? AND api_key IN (`+inPlaceholders(len(identifiers))+`)
		ORDER BY timestamp_ms DESC, id DESC
		LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0)
	for rows.Next() {
		var entry Entry
		var timestamp string
		var failed int
		if err := rows.Scan(
			&entry.RequestID, &timestamp, &entry.Endpoint, &entry.APIKey, &entry.SourceProtocol,
			&entry.Alias, &entry.Provider, &entry.ProviderType, &entry.Model, &entry.InternalModel,
			&entry.HTTPStatus, &entry.LatencyMS, &failed, &entry.Error,
			&entry.Tokens.InputTokens, &entry.Tokens.OutputTokens, &entry.Tokens.CacheReadTokens,
			&entry.Tokens.CacheCreationTokens, &entry.Tokens.CachedTokens, &entry.Tokens.ReasoningTokens,
			&entry.Tokens.TotalTokens,
		); err != nil {
			return nil, err
		}
		if parsed, err := time.Parse(time.RFC3339Nano, timestamp); err == nil {
			entry.Timestamp = parsed
		}
		entry.Failed = failed != 0
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// RecentByKey returns the most recent call-log entries matching any identifier.
func (s *Store) RecentByKey(ctx context.Context, identifiers []string, limit int) ([]Entry, error) {
	if len(identifiers) == 0 {
		return []Entry{}, nil
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	args := make([]any, 0, len(identifiers)+1)
	for _, id := range identifiers {
		args = append(args, id)
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, `SELECT
			request_id, timestamp, endpoint, api_key, source_protocol, alias, provider, provider_type,
			model, internal_model, http_status, latency_ms, failed, error, input_tokens, output_tokens,
			cache_read_tokens, cache_creation_tokens, cached_tokens, reasoning_tokens, total_tokens
		FROM call_logs
		WHERE api_key IN (`+inPlaceholders(len(identifiers))+`)
		ORDER BY timestamp_ms DESC, id DESC
		LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]Entry, 0, limit)
	for rows.Next() {
		var entry Entry
		var timestamp string
		var failed int
		if err := rows.Scan(
			&entry.RequestID,
			&timestamp,
			&entry.Endpoint,
			&entry.APIKey,
			&entry.SourceProtocol,
			&entry.Alias,
			&entry.Provider,
			&entry.ProviderType,
			&entry.Model,
			&entry.InternalModel,
			&entry.HTTPStatus,
			&entry.LatencyMS,
			&failed,
			&entry.Error,
			&entry.Tokens.InputTokens,
			&entry.Tokens.OutputTokens,
			&entry.Tokens.CacheReadTokens,
			&entry.Tokens.CacheCreationTokens,
			&entry.Tokens.CachedTokens,
			&entry.Tokens.ReasoningTokens,
			&entry.Tokens.TotalTokens,
		); err != nil {
			return nil, err
		}
		if parsed, err := time.Parse(time.RFC3339Nano, timestamp); err == nil {
			entry.Timestamp = parsed
		}
		entry.Failed = failed != 0
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// SumTokens totals each token category across the per-model sums.
func SumTokens(items []PerModelUsage) TokenSums {
	var out TokenSums
	for _, item := range items {
		out.InputTokens += item.Tokens.InputTokens
		out.OutputTokens += item.Tokens.OutputTokens
		out.CacheReadTokens += item.Tokens.CacheReadTokens
		out.CacheCreationTokens += item.Tokens.CacheCreationTokens
		out.CachedTokens += item.Tokens.CachedTokens
		out.ReasoningTokens += item.Tokens.ReasoningTokens
		out.TotalTokens += item.Tokens.TotalTokens
	}
	return out
}

// SumEntryTokens totals each token category across raw entries (for the quota
// page's token breakdown, independent of cost/multiplier).
func SumEntryTokens(entries []Entry) TokenSums {
	var out TokenSums
	for _, e := range entries {
		out.InputTokens += e.Tokens.InputTokens
		out.OutputTokens += e.Tokens.OutputTokens
		out.CacheReadTokens += e.Tokens.CacheReadTokens
		out.CacheCreationTokens += e.Tokens.CacheCreationTokens
		out.CachedTokens += e.Tokens.CachedTokens
		out.ReasoningTokens += e.Tokens.ReasoningTokens
		out.TotalTokens += e.Tokens.TotalTokens
	}
	return out
}

// Cost computes credits for one window from per-model token sums and a price
// map. A model with no price row contributes 0; a field with price 0 likewise.
// tokens are per 1M (matching how prices are expressed).
func Cost(sums []PerModelUsage, prices map[string]ModelPrice) float64 {
	const perMillion = 1_000_000.0
	var total float64
	for _, item := range sums {
		price, ok := prices[item.InternalModel]
		if !ok {
			continue
		}
		t := item.Tokens
		total += float64(t.InputTokens) / perMillion * price.InputPrice
		total += float64(t.OutputTokens) / perMillion * price.OutputPrice
		total += float64(t.CacheReadTokens) / perMillion * price.CacheReadPrice
		total += float64(t.CacheCreationTokens) / perMillion * price.CacheCreationPrice
		total += float64(t.CachedTokens) / perMillion * price.CachedPrice
		total += float64(t.ReasoningTokens) / perMillion * price.ReasoningPrice
	}
	return total
}
