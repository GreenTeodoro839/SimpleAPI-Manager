package callstore

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// ModelPrice holds the per-1M-token credit prices for one internal model
// (provider/aliasA). Each scalar field is credits per 1,000,000 tokens for the
// matching token category; a missing row or zero field contributes nothing.
// Prices are stored as full float64; rounding to 2 decimals is display-only.
// RateRules is the optional list of time-based multipliers (see rate_rules.go).
type ModelPrice struct {
	InternalModel      string     `json:"internal_model"`
	InputPrice         float64    `json:"input_price"`
	OutputPrice        float64    `json:"output_price"`
	CacheReadPrice     float64    `json:"cache_read_price"`
	CacheCreationPrice float64    `json:"cache_creation_price"`
	CachedPrice        float64    `json:"cached_price"`
	ReasoningPrice     float64    `json:"reasoning_price"`
	RateRules          []RateRule `json:"rate_rules"`
	UpdatedAtMS        int64      `json:"updated_at_ms"`
}

// priceColumns lists the scalar columns; rate_rules is handled separately as JSON.
const priceColumns = `internal_model, input_price, output_price, cache_read_price,
	cache_creation_price, cached_price, reasoning_price, updated_at_ms`

const priceSelect = `SELECT ` + priceColumns + `, rate_rules FROM model_prices`

func (s *Store) ListPrices(ctx context.Context) ([]ModelPrice, error) {
	rows, err := s.db.QueryContext(ctx, priceSelect+` ORDER BY internal_model ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ModelPrice, 0)
	for rows.Next() {
		p, err := scanPrice(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

// LoadPriceMap returns all prices keyed by internal_model for cost lookups.
func (s *Store) LoadPriceMap(ctx context.Context) (map[string]ModelPrice, error) {
	items, err := s.ListPrices(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]ModelPrice, len(items))
	for _, item := range items {
		out[item.InternalModel] = item
	}
	return out, nil
}

func (s *Store) GetPrice(ctx context.Context, internalModel string) (ModelPrice, bool, error) {
	row := s.db.QueryRowContext(ctx, priceSelect+` WHERE internal_model = ?`, internalModel)
	p, err := scanPrice(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return ModelPrice{}, false, nil
		}
		return ModelPrice{}, false, err
	}
	return p, true, nil
}

func scanPrice(scanner interface {
	Scan(dest ...any) error
}) (ModelPrice, error) {
	var p ModelPrice
	var rateRulesRaw []byte
	if err := scanner.Scan(
		&p.InternalModel,
		&p.InputPrice,
		&p.OutputPrice,
		&p.CacheReadPrice,
		&p.CacheCreationPrice,
		&p.CachedPrice,
		&p.ReasoningPrice,
		&p.UpdatedAtMS,
		&rateRulesRaw,
	); err != nil {
		return ModelPrice{}, err
	}
	if len(rateRulesRaw) > 0 {
		_ = json.Unmarshal(rateRulesRaw, &p.RateRules) // best-effort; empty stays nil
	}
	return p, nil
}

// UpsertPrice inserts or updates the price row for p.InternalModel.
func (s *Store) UpsertPrice(ctx context.Context, p ModelPrice) error {
	p.InternalModel = strings.TrimSpace(p.InternalModel)
	if p.InternalModel == "" {
		return errMissingInternalModel
	}
	p.UpdatedAtMS = time.Now().UnixMilli()
	rules := p.RateRules
	if rules == nil {
		rules = []RateRule{}
	}
	raw, err := json.Marshal(rules)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO model_prices (`+priceColumns+`, rate_rules)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(internal_model) DO UPDATE SET
			input_price = excluded.input_price,
			output_price = excluded.output_price,
			cache_read_price = excluded.cache_read_price,
			cache_creation_price = excluded.cache_creation_price,
			cached_price = excluded.cached_price,
			reasoning_price = excluded.reasoning_price,
			rate_rules = excluded.rate_rules,
			updated_at_ms = excluded.updated_at_ms`,
		p.InternalModel,
		p.InputPrice,
		p.OutputPrice,
		p.CacheReadPrice,
		p.CacheCreationPrice,
		p.CachedPrice,
		p.ReasoningPrice,
		p.UpdatedAtMS,
		string(raw),
	)
	return err
}

func (s *Store) DeletePrice(ctx context.Context, internalModel string) error {
	internalModel = strings.TrimSpace(internalModel)
	if internalModel == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM model_prices WHERE internal_model = ?`, internalModel)
	return err
}
