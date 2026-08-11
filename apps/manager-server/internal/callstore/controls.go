package callstore

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// UsageControl is a spend-limit configuration tied to an api-key by name and
// raw value. The ID is the stable identity; the api-key references are editable
// so a renamed/rotated key can be re-linked without losing the control record.
// AutoDisabled + DisableReason are owned by the enforcement layer (they record
// whether *we* disabled the key, so we only re-enable keys we disabled).
type UsageControl struct {
	ID            string  `json:"id"`
	APIKeyName    string  `json:"api_key_name"`
	APIKeyValue   string  `json:"api_key_value"`
	Limit5h       float64 `json:"limit_5h"`
	LimitWeek     float64 `json:"limit_week"`
	AutoDisabled  bool    `json:"auto_disabled"`
	DisableReason string  `json:"disable_reason"`
	CreatedAtMS   int64   `json:"created_at_ms"`
	UpdatedAtMS   int64   `json:"updated_at_ms"`

	// Usage5h / UsageWeek are computed (not stored) credits used in the current
	// rolling window, populated for list responses so the admin UI can show
	// live usage against the limit.
	Usage5h   float64 `json:"usage_5h,omitempty"`
	UsageWeek float64 `json:"usage_week,omitempty"`
}

const controlColumns = `id, api_key_name, api_key_value, limit_5h, limit_week,
	auto_disabled, disable_reason, created_at_ms, updated_at_ms`

func scanControl(scanner interface {
	Scan(dest ...any) error
}) (UsageControl, error) {
	var c UsageControl
	var autoDisabled int
	if err := scanner.Scan(
		&c.ID,
		&c.APIKeyName,
		&c.APIKeyValue,
		&c.Limit5h,
		&c.LimitWeek,
		&autoDisabled,
		&c.DisableReason,
		&c.CreatedAtMS,
		&c.UpdatedAtMS,
	); err != nil {
		return UsageControl{}, err
	}
	c.AutoDisabled = autoDisabled != 0
	return c, nil
}

func (s *Store) ListControls(ctx context.Context) ([]UsageControl, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+controlColumns+`
		FROM usage_controls ORDER BY api_key_name ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]UsageControl, 0)
	for rows.Next() {
		c, err := scanControl(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

func (s *Store) GetControl(ctx context.Context, id string) (UsageControl, bool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+controlColumns+`
		FROM usage_controls WHERE id = ?`, id)
	c, err := scanControl(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return UsageControl{}, false, nil
		}
		return UsageControl{}, false, err
	}
	return c, true, nil
}

// CreateControl inserts a new control. ID, CreatedAtMS and UpdatedAtMS are set
// here; AutoDisabled starts false.
func (s *Store) CreateControl(ctx context.Context, c UsageControl) (UsageControl, error) {
	c.APIKeyName = strings.TrimSpace(c.APIKeyName)
	c.APIKeyValue = strings.TrimSpace(c.APIKeyValue)
	if c.APIKeyName == "" {
		return UsageControl{}, errMissingAPIKeyName
	}
	now := time.Now().UnixMilli()
	if strings.TrimSpace(c.ID) == "" {
		c.ID = newID()
	}
	c.CreatedAtMS = now
	c.UpdatedAtMS = now
	c.DisableReason = ""
	_, err := s.db.ExecContext(ctx, `INSERT INTO usage_controls (`+controlColumns+`)
		VALUES (?, ?, ?, ?, ?, 0, '', ?, ?)`,
		c.ID, c.APIKeyName, c.APIKeyValue, c.Limit5h, c.LimitWeek, c.CreatedAtMS, c.UpdatedAtMS)
	if err != nil {
		return UsageControl{}, err
	}
	return c, nil
}

// UpdateControl updates the editable fields (api-key references + limits). It
// intentionally does not touch auto_disabled / disable_reason — only the
// enforcement layer flips those.
func (s *Store) UpdateControl(ctx context.Context, c UsageControl) error {
	id := strings.TrimSpace(c.ID)
	if id == "" {
		return errMissingControlID
	}
	c.APIKeyName = strings.TrimSpace(c.APIKeyName)
	c.APIKeyValue = strings.TrimSpace(c.APIKeyValue)
	if c.APIKeyName == "" {
		return errMissingAPIKeyName
	}
	_, err := s.db.ExecContext(ctx, `UPDATE usage_controls SET
			api_key_name = ?, api_key_value = ?, limit_5h = ?, limit_week = ?, updated_at_ms = ?
		WHERE id = ?`,
		c.APIKeyName, c.APIKeyValue, c.Limit5h, c.LimitWeek, time.Now().UnixMilli(), id)
	return err
}

// UpdateControlDisabledState records whether the enforcement layer disabled the
// key (and why), so a later under-limit check knows it may re-enable it.
func (s *Store) UpdateControlDisabledState(ctx context.Context, id string, disabled bool, reason string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errMissingControlID
	}
	flag := 0
	if disabled {
		flag = 1
	}
	_, err := s.db.ExecContext(ctx, `UPDATE usage_controls SET
			auto_disabled = ?, disable_reason = ?, updated_at_ms = ? WHERE id = ?`,
		flag, reason, time.Now().UnixMilli(), id)
	return err
}

func (s *Store) DeleteControl(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM usage_controls WHERE id = ?`, id)
	return err
}
