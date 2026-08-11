package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/store"
)

// errSimpleAPINotConfigured is returned when no SimpleAPI connection is saved.
var errSimpleAPINotConfigured = errors.New("SimpleAPI connection is not configured")

// apiKeyModel mirrors the fields of an api-key's model entry we need to resolve
// aliasB (the client-facing name) for the public quota page.
type apiKeyModel struct {
	Model  string `json:"model"`
	AliasB string `json:"aliasB"`
}

// apiKeySummary is the structured view of an inbound api-key used for lookups
// and aliasB resolution.
type apiKeySummary struct {
	Name    string        `json:"name"`
	Key     string        `json:"key"`
	Enabled bool          `json:"enabled"`
	Models  []apiKeyModel `json:"models"`
}

func (s *Server) apiKeysEndpoint() (string, *store.SimpleAPIConnection, error) {
	conn, ok := s.store.Connection()
	if !ok {
		return "", nil, errSimpleAPINotConfigured
	}
	return conn.BaseURL + store.NormalizeBasePath(conn.BasePath) + "/api-keys", &conn, nil
}

func (s *Server) simpleAPIClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}

// fetchAPIKeys returns all inbound api-keys from SimpleAPI.
func (s *Server) fetchAPIKeys(ctx context.Context) ([]apiKeySummary, error) {
	endpoint, conn, err := s.apiKeysEndpoint()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Admin-Key", conn.ManagementKey)
	res, err := s.simpleAPIClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, simpleAPIError("api-keys fetch", res)
	}
	var payload struct {
		APIKeys []apiKeySummary `json:"api_keys"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.APIKeys, nil
}

// findAPIKey returns the key matching value (preferred) or name.
func (s *Server) findAPIKey(ctx context.Context, name, value string) (apiKeySummary, bool, error) {
	keys, err := s.fetchAPIKeys(ctx)
	if err != nil {
		return apiKeySummary{}, false, err
	}
	for _, k := range keys {
		if value != "" && k.Key == value {
			return k, true, nil
		}
	}
	for _, k := range keys {
		if name != "" && k.Name == name {
			return k, true, nil
		}
	}
	return apiKeySummary{}, false, nil
}

// setAPIKeyEnabled flips the enabled flag on an api-key by GETting the full key
// object (as opaque JSON so no fields are clobbered) and PUTting it back.
func (s *Server) setAPIKeyEnabled(ctx context.Context, name string, enabled bool) error {
	endpoint, conn, err := s.apiKeysEndpoint()
	if err != nil {
		return err
	}
	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	getReq.Header.Set("X-Admin-Key", conn.ManagementKey)
	res, err := s.simpleAPIClient().Do(getReq)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return simpleAPIError("api-keys fetch (for update)", res)
	}
	var payload struct {
		APIKeys []map[string]any `json:"api_keys"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return err
	}
	var target map[string]any
	for _, k := range payload.APIKeys {
		if n, ok := k["name"].(string); ok && n == name {
			target = k
			break
		}
	}
	if target == nil {
		return errors.New("api-key not found upstream: " + name)
	}
	target["enabled"] = enabled
	body, err := json.Marshal(target)
	if err != nil {
		return err
	}
	putURL := endpoint + "/" + url.PathEscape(name)
	putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, putURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	putReq.Header.Set("X-Admin-Key", conn.ManagementKey)
	putReq.Header.Set("Content-Type", "application/json")
	putRes, err := s.simpleAPIClient().Do(putReq)
	if err != nil {
		return err
	}
	defer putRes.Body.Close()
	if putRes.StatusCode < 200 || putRes.StatusCode >= 300 {
		return simpleAPIError("api-keys update "+strconv.Itoa(putRes.StatusCode), putRes)
	}
	return nil
}

func simpleAPIError(prefix string, res *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = res.Status
	}
	return errors.New(prefix + " failed: " + message)
}
