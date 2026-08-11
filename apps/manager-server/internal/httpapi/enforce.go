package httpapi

import (
	"context"
	"log"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
)

const (
	enforcementInterval = 60 * time.Second
	enforcementTimeout  = 30 * time.Second
	window5h            = 5 * time.Hour
	windowWeek          = 7 * 24 * time.Hour
	disableReason       = "usage_limit_exceeded"
)

// overLimit treats a non-positive limit as "no limit for this window" so an
// unset/0 limit never disables a key; a positive limit disables on any overshoot.
func overLimit(used, limit float64) bool {
	return limit > 0 && used > limit
}

// computeControlUsage returns the credits used by a control's api-key in the
// rolling 5h and weekly windows, applying the supplied price map.
func (s *Server) computeControlUsage(ctx context.Context, c callstore.UsageControl, prices map[string]callstore.ModelPrice) (float64, float64) {
	ids := callstore.DedupeIdentifiers(c.APIKeyName, c.APIKeyValue)
	now := time.Now().UnixMilli()
	sum5h, err := s.callStore.UsageByKeyByModel(ctx, ids, now-window5h.Milliseconds())
	if err != nil {
		log.Printf("usage: 5h for %s: %v", c.APIKeyName, err)
	}
	sumWeek, err := s.callStore.UsageByKeyByModel(ctx, ids, now-windowWeek.Milliseconds())
	if err != nil {
		log.Printf("usage: week for %s: %v", c.APIKeyName, err)
	}
	return callstore.Cost(sum5h, prices), callstore.Cost(sumWeek, prices)
}

// EnforceUsageControls disables api-keys that have exceeded their 5h or weekly
// credit limit, and re-enables keys we previously disabled once both windows are
// back under their limits. It only touches keys the enforcement layer disabled
// (auto_disabled), never a manual disable. Best-effort: per-control errors are
// logged and skipped so one failing key can't block the others.
func (s *Server) EnforceUsageControls(ctx context.Context) {
	s.enforceMu.Lock()
	defer s.enforceMu.Unlock()

	if _, ok := s.store.Connection(); !ok {
		return
	}
	controls, err := s.callStore.ListControls(ctx)
	if err != nil {
		log.Printf("enforce: list controls: %v", err)
		return
	}
	if len(controls) == 0 {
		return
	}
	prices, err := s.callStore.LoadPriceMap(ctx)
	if err != nil {
		log.Printf("enforce: load prices: %v", err)
		return
	}

	now := time.Now().UnixMilli()
	since5h := now - window5h.Milliseconds()
	sinceWeek := now - windowWeek.Milliseconds()

	for _, c := range controls {
		// A failing iteration must not kill the whole pass.
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("enforce: panic on control %s (%s): %v", c.ID, c.APIKeyName, r)
				}
			}()
			ids := callstore.DedupeIdentifiers(c.APIKeyName, c.APIKeyValue)
			sum5h, err := s.callStore.UsageByKeyByModel(ctx, ids, since5h)
			if err != nil {
				log.Printf("enforce: usage5h %s: %v", c.APIKeyName, err)
				return
			}
			sumWeek, err := s.callStore.UsageByKeyByModel(ctx, ids, sinceWeek)
			if err != nil {
				log.Printf("enforce: usageWeek %s: %v", c.APIKeyName, err)
				return
			}
			used5h := callstore.Cost(sum5h, prices)
			usedWeek := callstore.Cost(sumWeek, prices)
			over := overLimit(used5h, c.Limit5h) || overLimit(usedWeek, c.LimitWeek)

			switch {
			case over && !c.AutoDisabled:
				if err := s.setAPIKeyEnabled(ctx, c.APIKeyName, false); err != nil {
					log.Printf("enforce: disable %s failed: %v", c.APIKeyName, err)
					return
				}
				if err := s.callStore.UpdateControlDisabledState(ctx, c.ID, true, disableReason); err != nil {
					log.Printf("enforce: mark disabled %s: %v", c.APIKeyName, err)
				}
			case !over && c.AutoDisabled:
				if err := s.setAPIKeyEnabled(ctx, c.APIKeyName, true); err != nil {
					log.Printf("enforce: enable %s failed: %v", c.APIKeyName, err)
					return
				}
				if err := s.callStore.UpdateControlDisabledState(ctx, c.ID, false, ""); err != nil {
					log.Printf("enforce: mark enabled %s: %v", c.APIKeyName, err)
				}
			}
		}()
	}
}

// syncAndEnforce syncs the latest call log and then runs enforcement. Sync
// errors are returned (so handlers can surface them); enforcement errors are
// best-effort and never propagated.
func (s *Server) syncAndEnforce(ctx context.Context, limit int) error {
	if err := s.syncSimpleAPICallLog(ctx, limit); err != nil {
		return err
	}
	s.enforceBackground()
	return nil
}

// RunEnforcementLoop periodically syncs and enforces until ctx is cancelled.
// Started as a goroutine from main.
func (s *Server) RunEnforcementLoop(ctx context.Context) {
	ticker := time.NewTicker(enforcementInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("enforce-loop: panic: %v", r)
					}
				}()
				loopCtx, cancel := context.WithTimeout(ctx, enforcementTimeout)
				defer cancel()
				if err := s.syncSimpleAPICallLog(loopCtx, 5000); err != nil {
					log.Printf("enforce-loop sync: %v", err)
				}
				s.EnforceUsageControls(loopCtx)
			}()
		}
	}
}

// enforceBackground runs enforcement in its own goroutine so callers (request
// handlers, control mutations) never block on SimpleAPI round-trips.
func (s *Server) enforceBackground() {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("enforce-background: panic: %v", r)
			}
		}()
		ctx, cancel := context.WithTimeout(context.Background(), enforcementTimeout)
		defer cancel()
		s.EnforceUsageControls(ctx)
	}()
}
