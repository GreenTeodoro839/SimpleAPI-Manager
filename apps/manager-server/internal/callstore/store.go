package callstore

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Tokens struct {
	InputTokens         int64 `json:"input_tokens"`
	OutputTokens        int64 `json:"output_tokens"`
	CacheReadTokens     int64 `json:"cache_read_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_tokens"`
	CachedTokens        int64 `json:"cached_tokens"`
	ReasoningTokens     int64 `json:"reasoning_tokens"`
	TotalTokens         int64 `json:"total_tokens"`
}

type Entry struct {
	RequestID      string    `json:"request_id"`
	Timestamp      time.Time `json:"timestamp"`
	Endpoint       string    `json:"endpoint"`
	APIKey         string    `json:"api_key"`
	SourceProtocol string    `json:"source_protocol"`
	Alias          string    `json:"alias"`
	Provider       string    `json:"provider"`
	ProviderType   string    `json:"provider_type"`
	Model          string    `json:"model"`
	InternalModel  string    `json:"internal_model"`
	HTTPStatus     int       `json:"http_status"`
	LatencyMS      int64     `json:"latency_ms"`
	Failed         bool      `json:"failed"`
	Error          string    `json:"error,omitempty"`
	Tokens         Tokens    `json:"tokens"`
}

type Store struct {
	db *sql.DB
}

func Open(dataDir string) (*Store, error) {
	if strings.TrimSpace(dataDir) == "" {
		dataDir = "./data"
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(dataDir, "manager.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	st := &Store{db: db}
	if err := st.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return st, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) init() error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA busy_timeout = 5000`,
		`CREATE TABLE IF NOT EXISTS call_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			dedupe_key TEXT NOT NULL UNIQUE,
			request_id TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			timestamp_ms INTEGER NOT NULL,
			endpoint TEXT NOT NULL,
			api_key TEXT NOT NULL,
			source_protocol TEXT NOT NULL,
			alias TEXT NOT NULL,
			provider TEXT NOT NULL,
			provider_type TEXT NOT NULL,
			model TEXT NOT NULL,
			internal_model TEXT NOT NULL,
			http_status INTEGER NOT NULL,
			latency_ms INTEGER NOT NULL,
			failed INTEGER NOT NULL,
			error TEXT NOT NULL,
			input_tokens INTEGER NOT NULL,
			output_tokens INTEGER NOT NULL,
			cache_read_tokens INTEGER NOT NULL,
			cache_creation_tokens INTEGER NOT NULL,
			cached_tokens INTEGER NOT NULL,
			reasoning_tokens INTEGER NOT NULL,
			total_tokens INTEGER NOT NULL,
			created_at_ms INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_call_logs_timestamp ON call_logs(timestamp_ms DESC, id DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_call_logs_api_key ON call_logs(api_key)`,
		`CREATE INDEX IF NOT EXISTS idx_call_logs_internal_model ON call_logs(internal_model)`,
		`CREATE INDEX IF NOT EXISTS idx_call_logs_failed ON call_logs(failed)`,
	}
	for _, stmt := range statements {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) SaveEntries(ctx context.Context, entries []Entry) (int64, error) {
	if len(entries) == 0 {
		return 0, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	stmt, err := tx.PrepareContext(ctx, `INSERT OR IGNORE INTO call_logs (
		dedupe_key, request_id, timestamp, timestamp_ms, endpoint, api_key, source_protocol,
		alias, provider, provider_type, model, internal_model, http_status, latency_ms,
		failed, error, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
		cached_tokens, reasoning_tokens, total_tokens, created_at_ms
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()
	var inserted int64
	now := time.Now().UnixMilli()
	for _, entry := range entries {
		entry = normalizeEntry(entry)
		res, execErr := stmt.ExecContext(ctx,
			dedupeKey(entry),
			entry.RequestID,
			entry.Timestamp.Format(time.RFC3339Nano),
			entry.Timestamp.UnixMilli(),
			entry.Endpoint,
			entry.APIKey,
			entry.SourceProtocol,
			entry.Alias,
			entry.Provider,
			entry.ProviderType,
			entry.Model,
			entry.InternalModel,
			entry.HTTPStatus,
			entry.LatencyMS,
			boolInt(entry.Failed),
			entry.Error,
			entry.Tokens.InputTokens,
			entry.Tokens.OutputTokens,
			entry.Tokens.CacheReadTokens,
			entry.Tokens.CacheCreationTokens,
			entry.Tokens.CachedTokens,
			entry.Tokens.ReasoningTokens,
			entry.Tokens.TotalTokens,
			now,
		)
		if execErr != nil {
			err = execErr
			return 0, err
		}
		if n, affectedErr := res.RowsAffected(); affectedErr == nil {
			inserted += n
		}
	}
	err = tx.Commit()
	return inserted, err
}

func (s *Store) Recent(ctx context.Context, limit int) ([]Entry, error) {
	if limit <= 0 {
		limit = 300
	}
	if limit > 5000 {
		limit = 5000
	}
	rows, err := s.db.QueryContext(ctx, `SELECT
		request_id, timestamp, endpoint, api_key, source_protocol, alias, provider, provider_type,
		model, internal_model, http_status, latency_ms, failed, error, input_tokens, output_tokens,
		cache_read_tokens, cache_creation_tokens, cached_tokens, reasoning_tokens, total_tokens
		FROM call_logs
		ORDER BY timestamp_ms DESC, id DESC
		LIMIT ?`, limit)
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
		parsed, err := time.Parse(time.RFC3339Nano, timestamp)
		if err == nil {
			entry.Timestamp = parsed
		}
		entry.Failed = failed != 0
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func normalizeEntry(entry Entry) Entry {
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	entry.Error = strings.TrimSpace(entry.Error)
	return entry
}

func dedupeKey(entry Entry) string {
	raw := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%d|%d|%s|%d",
		entry.RequestID,
		entry.Timestamp.Format(time.RFC3339Nano),
		entry.Endpoint,
		entry.APIKey,
		entry.Provider,
		entry.Model,
		entry.HTTPStatus,
		entry.LatencyMS,
		entry.Error,
		entry.Tokens.TotalTokens,
	)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
