package callstore

import (
	"context"
	"testing"
)

func TestCreateListGetDeleteControl(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	created, err := st.CreateControl(ctx, UsageControl{
		APIKeyName: "Claude Code", APIKeyValue: "sk-abc",
		Limit5h: 5.5, LimitWeek: 50,
	})
	if err != nil {
		t.Fatalf("CreateControl: %v", err)
	}
	if created.ID == "" {
		t.Fatal("CreateControl did not assign an id")
	}
	if created.CreatedAtMS == 0 || created.AutoDisabled {
		t.Fatalf("unexpected created state: %+v", created)
	}

	got, ok, err := st.GetControl(ctx, created.ID)
	if err != nil || !ok {
		t.Fatalf("GetControl = (%+v, %v, %v)", got, ok, err)
	}
	if got.APIKeyName != "Claude Code" || got.APIKeyValue != "sk-abc" || got.Limit5h != 5.5 || got.LimitWeek != 50 {
		t.Fatalf("unexpected control: %+v", got)
	}

	listed, err := st.ListControls(ctx)
	if err != nil {
		t.Fatalf("ListControls: %v", err)
	}
	if len(listed) != 1 {
		t.Fatalf("expected 1 control, got %d", len(listed))
	}

	if err := st.DeleteControl(ctx, created.ID); err != nil {
		t.Fatalf("DeleteControl: %v", err)
	}
	listed, _ = st.ListControls(ctx)
	if len(listed) != 0 {
		t.Fatalf("expected 0 controls after delete, got %d", len(listed))
	}
}

func TestUpdateControlPreservesAutoDisabled(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	created, _ := st.CreateControl(ctx, UsageControl{APIKeyName: "k", APIKeyValue: "v", Limit5h: 1, LimitWeek: 10})
	if err := st.UpdateControlDisabledState(ctx, created.ID, true, "usage_limit_exceeded"); err != nil {
		t.Fatalf("UpdateControlDisabledState: %v", err)
	}

	// Admin edits limits; auto_disabled must be preserved (enforcement owns it).
	created.Limit5h = 9
	created.LimitWeek = 99
	if err := st.UpdateControl(ctx, created); err != nil {
		t.Fatalf("UpdateControl: %v", err)
	}
	got, _, _ := st.GetControl(ctx, created.ID)
	if !got.AutoDisabled || got.DisableReason != "usage_limit_exceeded" {
		t.Fatalf("UpdateControl clobbered enforcement state: %+v", got)
	}
	if got.Limit5h != 9 || got.LimitWeek != 99 {
		t.Fatalf("limits not updated: %+v", got)
	}
}

func TestCreateControlRejectsMissingName(t *testing.T) {
	st, _ := Open(t.TempDir())
	defer st.Close()
	if _, err := st.CreateControl(context.Background(), UsageControl{APIKeyValue: "v"}); err == nil {
		t.Fatal("expected error for missing api_key_name")
	}
}
