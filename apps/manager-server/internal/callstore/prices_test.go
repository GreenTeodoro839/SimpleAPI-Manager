package callstore

import (
	"context"
	"testing"
)

func TestUpsertPriceCreatesThenUpdates(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	first := ModelPrice{
		InternalModel: "claude/sonnet4", InputPrice: 3, OutputPrice: 15,
		CacheReadPrice: 0.3, CacheCreationPrice: 3.75, CachedPrice: 0.3, ReasoningPrice: 15,
	}
	if err := st.UpsertPrice(ctx, first); err != nil {
		t.Fatalf("UpsertPrice first: %v", err)
	}
	second := first
	second.OutputPrice = 18.25 // store full float; no truncation
	second.ReasoningPrice = 0.0001
	if err := st.UpsertPrice(ctx, second); err != nil {
		t.Fatalf("UpsertPrice second: %v", err)
	}

	items, err := st.ListPrices(ctx)
	if err != nil {
		t.Fatalf("ListPrices: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 row after upsert, got %d", len(items))
	}
	got := items[0]
	if got.OutputPrice != 18.25 {
		t.Fatalf("OutputPrice = %v, want 18.25", got.OutputPrice)
	}
	if got.ReasoningPrice != 0.0001 {
		t.Fatalf("ReasoningPrice = %v, want 0.0001 (no truncation)", got.ReasoningPrice)
	}
	if got.InternalModel != "claude/sonnet4" {
		t.Fatalf("InternalModel = %q", got.InternalModel)
	}
}

func TestListPricesOrdersByInternalModel(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	for _, m := range []string{"zeta/last", "alpha/first", "mid/second"} {
		if err := st.UpsertPrice(ctx, ModelPrice{InternalModel: m, InputPrice: 1}); err != nil {
			t.Fatalf("UpsertPrice %s: %v", m, err)
		}
	}
	items, err := st.ListPrices(ctx)
	if err != nil {
		t.Fatalf("ListPrices: %v", err)
	}
	if len(items) != 3 || items[0].InternalModel != "alpha/first" || items[2].InternalModel != "zeta/last" {
		t.Fatalf("unexpected order: %+v", items)
	}
}

func TestGetPriceMissingReturnsFalse(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	_, ok, err := st.GetPrice(context.Background(), "nope/missing")
	if err != nil || ok {
		t.Fatalf("GetPrice missing = (%v, %v, %v), want (zero, false, nil)", ModelPrice{}, ok, err)
	}
}

func TestDeletePriceIdempotent(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	ctx := context.Background()
	if err := st.UpsertPrice(ctx, ModelPrice{InternalModel: "p/a", InputPrice: 1}); err != nil {
		t.Fatalf("UpsertPrice: %v", err)
	}
	if err := st.DeletePrice(ctx, "p/a"); err != nil {
		t.Fatalf("DeletePrice first: %v", err)
	}
	if err := st.DeletePrice(ctx, "p/a"); err != nil {
		t.Fatalf("DeletePrice second (idempotent): %v", err)
	}
}
