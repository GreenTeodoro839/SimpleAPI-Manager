package callstore

import (
	"time"
)

// RateRule defines a time-based price multiplier for one model.
//   - Weekdays uses Go time.Weekday ordering: 0=Sunday ... 6=Saturday. An empty
//     slice means "every day".
//   - StartHour/EndHour form a half-open interval [start, end), in 0..24 (end
//     may be 24 = midnight). If StartHour >= EndHour the range wraps across
//     midnight (e.g. 22..6 = 22:00-06:00).
//   - Multiplier is applied as-is: 0 means the window is free. Only the absence
//     of a matching rule (or no rules at all) defaults to 1.
type RateRule struct {
	Name       string  `json:"name,omitempty"`
	Weekdays   []int   `json:"weekdays,omitempty"`
	StartHour  int     `json:"start_hour"`
	EndHour    int     `json:"end_hour"`
	Multiplier float64 `json:"multiplier"`
}

// RateMultiplier returns the multiplier applicable at t (interpreted in loc) for
// an ordered rule list: the first matching rule wins; 1.0 if none match.
func RateMultiplier(rules []RateRule, t time.Time, loc *time.Location) float64 {
	if loc == nil {
		loc = time.Local
	}
	local := t.In(loc)
	hour := local.Hour()
	weekday := int(local.Weekday()) // 0=Sunday
	for _, rule := range rules {
		if len(rule.Weekdays) > 0 && !containsInt(rule.Weekdays, weekday) {
			continue
		}
		if inHourRange(hour, rule.StartHour, rule.EndHour) {
			// 0 means the window is free; only "no matching rule" defaults to 1.
			return rule.Multiplier
		}
	}
	return 1
}

func containsInt(needles []int, haystack int) bool {
	for _, n := range needles {
		if n == haystack {
			return true
		}
	}
	return false
}

func inHourRange(hour, start, end int) bool {
	if start == end {
		return false // empty range matches nothing
	}
	if start < end {
		return hour >= start && hour < end
	}
	// wrap across midnight, e.g. start=22, end=6
	return hour >= start || hour < end
}

// CostForEntries computes billed credits for a set of call-log entries, applying
// each model's base price and the time-of-day multiplier at the entry timestamp
// (interpreted in loc). Used for billing-aware totals (enforcement, quota). A
// model with no price row contributes 0.
func CostForEntries(entries []Entry, prices map[string]ModelPrice, loc *time.Location) float64 {
	const perMillion = 1_000_000.0
	var total float64
	for _, e := range entries {
		price, ok := prices[e.InternalModel]
		if !ok {
			continue
		}
		base := float64(e.Tokens.InputTokens)/perMillion*price.InputPrice +
			float64(e.Tokens.OutputTokens)/perMillion*price.OutputPrice +
			float64(e.Tokens.CacheReadTokens)/perMillion*price.CacheReadPrice +
			float64(e.Tokens.CacheCreationTokens)/perMillion*price.CacheCreationPrice +
			float64(e.Tokens.CachedTokens)/perMillion*price.CachedPrice +
			float64(e.Tokens.ReasoningTokens)/perMillion*price.ReasoningPrice
		total += base * RateMultiplier(price.RateRules, e.Timestamp, loc)
	}
	return total
}
