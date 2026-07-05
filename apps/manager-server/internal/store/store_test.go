package store

import "testing"

func TestEnsureConnectionInitializesMissingConnection(t *testing.T) {
	st, _, err := Open(t.TempDir(), "manager-key", func() (string, error) {
		return "generated-manager-key", nil
	})
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	initialized, err := st.EnsureConnection(SimpleAPIConnection{
		BaseURL:       "http://127.0.0.1:8317/",
		BasePath:      "",
		ManagementKey: " simpleapi-key ",
	})
	if err != nil {
		t.Fatalf("ensure connection: %v", err)
	}
	if !initialized {
		t.Fatal("expected connection to be initialized")
	}

	conn, ok := st.Connection()
	if !ok {
		t.Fatal("expected stored connection")
	}
	if conn.BaseURL != "http://127.0.0.1:8317" {
		t.Fatalf("unexpected base url: %q", conn.BaseURL)
	}
	if conn.BasePath != "/v0/management" {
		t.Fatalf("unexpected base path: %q", conn.BasePath)
	}
	if conn.ManagementKey != "simpleapi-key" {
		t.Fatalf("unexpected management key: %q", conn.ManagementKey)
	}
}

func TestEnsureConnectionDoesNotOverwriteExistingConnection(t *testing.T) {
	st, _, err := Open(t.TempDir(), "manager-key", func() (string, error) {
		return "generated-manager-key", nil
	})
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := st.SaveConnection(SimpleAPIConnection{
		BaseURL:       "http://simpleapi.example",
		BasePath:      "/v0/management",
		ManagementKey: "existing-key",
	}); err != nil {
		t.Fatalf("save connection: %v", err)
	}

	initialized, err := st.EnsureConnection(SimpleAPIConnection{
		BaseURL:       "",
		BasePath:      "",
		ManagementKey: "",
	})
	if err != nil {
		t.Fatalf("ensure connection should ignore invalid defaults when connection exists: %v", err)
	}
	if initialized {
		t.Fatal("did not expect existing connection to be overwritten")
	}

	conn, ok := st.Connection()
	if !ok {
		t.Fatal("expected stored connection")
	}
	if conn.BaseURL != "http://simpleapi.example" || conn.ManagementKey != "existing-key" {
		t.Fatalf("existing connection was overwritten: %+v", conn)
	}
}
