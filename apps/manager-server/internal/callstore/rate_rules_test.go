package callstore

import (
	"context"
	"testing"
	"time"
)

func shanghai() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic(err)
	}
	return loc
}

func TestRateMultiplierDefaultIsOne(t *testing.T) {
	got := RateMultiplier(nil, time.Now(), shanghai())
	if got != 1 {
		t.Fatalf("no rules => %v, want 1", got)
	}
}

func TestRateMultiplierWeekdayFilter(t *testing.T) {
	loc := shanghai()
	noon := time.Date(2026, 8, 10, 12, 0, 0, 0, loc) // 12:00 Beijing, whatever weekday
	wd := int(noon.Weekday())
	// Rule applies only to that weekday, 09:00-18:00 = 2x
	rule := RateRule{Weekdays: []int{wd}, StartHour: 9, EndHour: 18, Multiplier: 2}

	if got := RateMultiplier([]RateRule{rule}, noon, loc); got != 2 {
		t.Fatalf("same-weekday in-range => %v, want 2", got)
	}
	evening := noon.Add(8 * time.Hour) // 20:00 same weekday -> outside hours
	if got := RateMultiplier([]RateRule{rule}, evening, loc); got != 1 {
		t.Fatalf("outside hours => %v, want 1", got)
	}
	nextDay := noon.Add(24 * time.Hour) // different weekday
	if got := RateMultiplier([]RateRule{rule}, nextDay, loc); got != 1 {
		t.Fatalf("different weekday => %v, want 1", got)
	}
}

func TestRateMultiplierCrossMidnight(t *testing.T) {
	// Rule: every day 22:00-06:00 = 0.5x
	rule := RateRule{StartHour: 22, EndHour: 6, Multiplier: 0.5}
	loc := shanghai()
	cases := map[int]float64{
		23: 0.5, // 23:00 inside
		2:  0.5, // 02:00 inside (wrapped)
		6:  1,   // 06:00 is half-open upper bound -> excluded
		12: 1,   // noon outside
	}
	for hour, want := range cases {
		ts := time.Date(2026, 8, 10, hour, 0, 0, 0, loc)
		if got := RateMultiplier([]RateRule{rule}, ts, loc); got != want {
			t.Errorf("hour %d => %v, want %v", hour, got, want)
		}
	}
}

func TestRateMultiplierOrderedFirstMatch(t *testing.T) {
	// Two overlapping rules; the first that matches wins.
	rules := []RateRule{
		{Name: "peak", StartHour: 0, EndHour: 24, Multiplier: 3},       // all day 3x
		{Name: "offpeak", StartHour: 0, EndHour: 24, Multiplier: 0.5}, // would be 0.5x but second
	}
	loc := shanghai()
	if got := RateMultiplier(rules, time.Now().In(loc), loc); got != 3 {
		t.Fatalf("first match => %v, want 3", got)
	}
}

func TestRateMultiplierZeroIsFree(t *testing.T) {
	// An explicit 0 multiplier means free; it is NOT coerced to 1.
	rule := RateRule{StartHour: 0, EndHour: 24, Multiplier: 0}
	if got := RateMultiplier([]RateRule{rule}, time.Now().In(shanghai()), shanghai()); got != 0 {
		t.Fatalf("multiplier 0 => %v, want 0 (free)", got)
	}
}

func TestCostForEntriesFreeRuleZero(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	loc := shanghai()
	if err := st.UpsertPrice(ctx, ModelPrice{
		InternalModel: "p/a", InputPrice: 10,
		RateRules: []RateRule{{StartHour: 0, EndHour: 24, Multiplier: 0}}, // free all day
	}); err != nil {
		t.Fatalf("UpsertPrice: %v", err)
	}
	prices, _ := st.LoadPriceMap(ctx)
	mustSave(t, st, entryAt("k", "p/a", time.Now().In(loc), Tokens{InputTokens: 1_000_000, TotalTokens: 1_000_000}))
	entries, _ := st.EntriesByKey(ctx, []string{"k"}, 0, 1000)
	if got := CostForEntries(entries, prices, loc); got != 0 {
		t.Fatalf("free rule => %v, want 0", got)
	}
}

func TestCostForEntriesAppliesMultiplier(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	loc := shanghai()

	// Model with 10 credits/1M input, and a 2x rule all day.
	if err := st.UpsertPrice(ctx, ModelPrice{
		InternalModel: "p/a",
		InputPrice:    10,
		RateRules:     []RateRule{{StartHour: 0, EndHour: 24, Multiplier: 2}},
	}); err != nil {
		t.Fatalf("UpsertPrice: %v", err)
	}
	prices, _ := st.LoadPriceMap(ctx)

	// 1M input tokens at 10 credits * 2x => 20 credits.
	mustSave(t, st, entryAt("k", "p/a", time.Now().In(loc), Tokens{InputTokens: 1_000_000, TotalTokens: 1_000_000}))
	entries, err := st.EntriesByKey(ctx, []string{"k"}, 0, 1000)
	if err != nil {
		t.Fatalf("EntriesByKey: %v", err)
	}
	if got := CostForEntries(entries, prices, loc); got != 20 {
		t.Fatalf("CostForEntries = %v, want 20", got)
	}
}

func TestRateRulesPersistRoundTrip(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	ctx := context.Background()
	rules := []RateRule{{Name: "peak", Weekdays: []int{1, 2}, StartHour: 9, EndHour: 18, Multiplier: 1.5}}
	if err := st.UpsertPrice(ctx, ModelPrice{InternalModel: "p/a", InputPrice: 1, RateRules: rules}); err != nil {
		t.Fatalf("UpsertPrice: %v", err)
	}
	got, ok, err := st.GetPrice(ctx, "p/a")
	if err != nil || !ok {
		t.Fatalf("GetPrice: (%+v, %v, %v)", got, ok, err)
	}
	if len(got.RateRules) != 1 || got.RateRules[0].Name != "peak" || got.RateRules[0].Multiplier != 1.5 ||
		len(got.RateRules[0].Weekdays) != 2 || got.RateRules[0].StartHour != 9 || got.RateRules[0].EndHour != 18 {
		t.Fatalf("rate rules did not round-trip: %+v", got.RateRules)
	}
}
