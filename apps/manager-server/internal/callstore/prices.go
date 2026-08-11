package callstore

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// ModelPrice holds the per-1M-token credit prices for one internal model
// (provider/aliasA). Each field is credits per 1,000,000 tokens for the
// matching token category; a missing row or zero field contributes nothing.
// Prices are stored as full float64; rounding to 2 decimals is display-only.
type ModelPrice struct {
	InternalModel      string  `json:"internal_model"`
	InputPrice         float64 `json:"input_price"`
	OutputPrice        float64 `json:"output_price"`
	CacheReadPrice     float64 `json:"cache_read_price"`
	CacheCreationPrice float64 `json:"cache_creation_price"`
	CachedPrice        float64 `json:"cached_price"`
	ReasoningPrice     float64 `json:"reasoning_price"`
	UpdatedAtMS        int64   `json:"updated_at_ms"`
}

const priceColumns = `internal_model, input_price, output_price, cache_read_price,
	cache_creation_price, cached_price, reasoning_price, updated_at_ms`

func (s *Store) ListPrices(ctx context.Context) ([]ModelPrice, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+priceColumns+`
		FROM model_prices ORDER BY internal_model ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ModelPrice, 0)
	for rows.Next() {
		var p ModelPrice
		if err := rows.Scan(
			&p.InternalModel,
			&p.InputPrice,
			&p.OutputPrice,
			&p.CacheReadPrice,
			&p.CacheCreationPrice,
			&p.CachedPrice,
			&p.ReasoningPrice,
			&p.UpdatedAtMS,
		); err != nil {
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
	row := s.db.QueryRowContext(ctx, `SELECT `+priceColumns+`
		FROM model_prices WHERE internal_model = ?`, internalModel)
	var p ModelPrice
	if err := row.Scan(
		&p.InternalModel,
		&p.InputPrice,
		&p.OutputPrice,
		&p.CacheReadPrice,
		&p.CacheCreationPrice,
		&p.CachedPrice,
		&p.ReasoningPrice,
		&p.UpdatedAtMS,
	); err != nil {
		if err == sql.ErrNoRows {
			return ModelPrice{}, false, nil
		}
		return ModelPrice{}, false, err
	}
	return p, true, nil
}

// UpsertPrice inserts or updates the price row for p.InternalModel.
func (s *Store) UpsertPrice(ctx context.Context, p ModelPrice) error {
	p.InternalModel = strings.TrimSpace(p.InternalModel)
	if p.InternalModel == "" {
		return errMissingInternalModel
	}
	p.UpdatedAtMS = time.Now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `INSERT INTO model_prices (`+priceColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(internal_model) DO UPDATE SET
			input_price = excluded.input_price,
			output_price = excluded.output_price,
			cache_read_price = excluded.cache_read_price,
			cache_creation_price = excluded.cache_creation_price,
			cached_price = excluded.cached_price,
			reasoning_price = excluded.reasoning_price,
			updated_at_ms = excluded.updated_at_ms`,
		p.InternalModel,
		p.InputPrice,
		p.OutputPrice,
		p.CacheReadPrice,
		p.CacheCreationPrice,
		p.CachedPrice,
		p.ReasoningPrice,
		p.UpdatedAtMS,
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
