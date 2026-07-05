package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/config"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/response"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/security"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/store"
)

type Server struct {
	cfg       config.Config
	store     *store.Store
	callStore *callstore.Store
	startedAt int64
}

func New(cfg config.Config, st *store.Store, callStore *callstore.Store, startedAt int64) http.Handler {
	s := &Server{cfg: cfg, store: st, callStore: callStore, startedAt: startedAt}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/api/info", s.info)
	mux.HandleFunc("/api/setup", s.setup)
	mux.HandleFunc("/api/manager-config", s.managerConfig)
	mux.HandleFunc("/api/call-log", s.callLog)
	mux.HandleFunc("/api/usage", s.usage)
	mux.HandleFunc("/simpleapi/", s.proxySimpleAPI)
	mux.HandleFunc("/", s.panel)
	return recoverer(logger(mux))
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.MethodNotAllowed(w)
		return
	}
	_, configured := s.store.Connection()
	response.JSON(w, http.StatusOK, map[string]any{
		"service":       "simpleapi-manager",
		"mode":          "embedded",
		"startedAt":     s.startedAt,
		"adminReady":    true,
		"configured":    configured,
		"setupRequired": !configured,
	})
}

type setupRequest struct {
	SimpleAPIBaseURL string `json:"simpleApiBaseUrl"`
	CPABaseURL       string `json:"cpaBaseUrl"`
	BaseURL          string `json:"baseUrl"`
	ManagementKey    string `json:"managementKey"`
	BasePath         string `json:"basePath"`
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.MethodNotAllowed(w)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	var req setupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	conn := requestConnection(req)
	if err := validateSimpleAPI(r.Context(), conn); err != nil {
		response.Error(w, http.StatusBadGateway, "management_api_validation_failed", err.Error())
		return
	}
	if err := s.store.SaveConnection(conn); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"upstream": conn.BaseURL,
	})
}

func (s *Server) managerConfig(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		conn, configured := s.store.PublicConnection()
		response.JSON(w, http.StatusOK, map[string]any{
			"config": map[string]any{
				"simpleApiConnection": conn,
			},
			"configured": configured,
			"source":     "file",
		})
	case http.MethodPut:
		var req struct {
			Config struct {
				SimpleAPIConnection setupRequest `json:"simpleApiConnection"`
			} `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		conn := requestConnection(req.Config.SimpleAPIConnection)
		if err := validateSimpleAPI(r.Context(), conn); err != nil {
			response.Error(w, http.StatusBadGateway, "management_api_validation_failed", err.Error())
			return
		}
		if err := s.store.SaveConnection(conn); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		public, _ := s.store.PublicConnection()
		response.JSON(w, http.StatusOK, map[string]any{
			"config": map[string]any{
				"simpleApiConnection": public,
			},
			"source": "file",
		})
	default:
		response.MethodNotAllowed(w)
	}
}

func (s *Server) callLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.MethodNotAllowed(w)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	limit := parseLimit(r.URL.Query().Get("limit"), 300)
	syncErr := s.syncSimpleAPICallLog(r.Context(), limit)
	items, err := s.callStore.Recent(r.Context(), limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	out := map[string]any{
		"items":     items,
		"persisted": true,
	}
	if syncErr != nil {
		out["syncError"] = syncErr.Error()
	}
	response.JSON(w, http.StatusOK, out)
}

func (s *Server) usage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.MethodNotAllowed(w)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	syncLimit := parseLimit(r.URL.Query().Get("syncLimit"), 5000)
	syncErr := s.syncSimpleAPICallLog(r.Context(), syncLimit)
	items, err := s.callStore.Usage(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	out := map[string]any{
		"items":     items,
		"persisted": true,
	}
	if syncErr != nil {
		out["syncError"] = syncErr.Error()
	}
	response.JSON(w, http.StatusOK, out)
}

func (s *Server) proxySimpleAPI(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	conn, ok := s.store.Connection()
	if !ok {
		response.Error(w, http.StatusPreconditionRequired, "simpleapi_not_configured", "SimpleAPI connection is not configured")
		return
	}
	target, err := url.Parse(conn.BaseURL)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "invalid_target", err.Error())
		return
	}
	targetPath, ok := mapProxyPath(r.URL.Path, conn.BasePath)
	if !ok {
		response.Error(w, http.StatusNotFound, "not_found", "unsupported SimpleAPI proxy path")
		return
	}
	if r.Body != nil && isJSONContentType(r.Header.Get("Content-Type")) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.URL.Path = targetPath
		req.URL.RawPath = ""
		req.Host = target.Host
		req.Header.Del("Authorization")
		req.Header.Set("X-Admin-Key", conn.ManagementKey)
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		response.Error(w, http.StatusBadGateway, "upstream_error", err.Error())
	}
	proxy.ServeHTTP(w, r)
}

func (s *Server) syncSimpleAPICallLog(ctx context.Context, limit int) error {
	conn, ok := s.store.Connection()
	if !ok {
		return errors.New("SimpleAPI connection is not configured")
	}
	endpoint := conn.BaseURL + store.NormalizeBasePath(conn.BasePath) + "/call-log?limit=" + strconv.Itoa(limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Admin-Key", conn.ManagementKey)
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = res.Status
		}
		return errors.New("SimpleAPI call-log sync failed: " + message)
	}
	var payload struct {
		Items []callstore.Entry `json:"items"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return err
	}
	_, err = s.callStore.SaveEntries(ctx, payload.Items)
	return err
}

func (s *Server) panel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		response.MethodNotAllowed(w)
		return
	}
	panelPath := strings.TrimSpace(s.cfg.PanelPath)
	if panelPath == "" {
		response.JSON(w, http.StatusOK, map[string]any{
			"service": "simpleapi-manager",
			"message": "web panel is not configured; run the Vite dev server or set PANEL_PATH to apps/web/dist",
		})
		return
	}
	path := filepath.Join(panelPath, filepath.Clean(r.URL.Path))
	if stat, err := os.Stat(path); err == nil && !stat.IsDir() {
		http.ServeFile(w, r, path)
		return
	}
	http.ServeFile(w, r, filepath.Join(panelPath, "index.html"))
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) bool {
	key := security.ExtractBearer(r.Header.Get("Authorization"))
	if !s.store.VerifyAdminKey(key) {
		response.Error(w, http.StatusUnauthorized, "invalid_admin_key", "invalid admin key")
		return false
	}
	return true
}

func requestConnection(req setupRequest) store.SimpleAPIConnection {
	baseURL := req.SimpleAPIBaseURL
	if baseURL == "" {
		baseURL = req.BaseURL
	}
	if baseURL == "" {
		baseURL = req.CPABaseURL
	}
	return store.SimpleAPIConnection{
		BaseURL:       store.NormalizeBaseURL(baseURL),
		ManagementKey: strings.TrimSpace(req.ManagementKey),
		BasePath:      store.NormalizeBasePath(req.BasePath),
	}
}

func parseLimit(raw string, fallback int) int {
	limit := fallback
	if raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			limit = value
		}
	}
	if limit > 5000 {
		return 5000
	}
	return limit
}

func validateSimpleAPI(ctx context.Context, conn store.SimpleAPIConnection) error {
	if conn.BaseURL == "" || conn.ManagementKey == "" {
		return errors.New("simpleApiBaseUrl and managementKey are required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, conn.BaseURL+store.NormalizeBasePath(conn.BasePath)+"/config", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Admin-Key", conn.ManagementKey)
	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return errors.New("SimpleAPI management API validation failed: " + res.Status)
	}
	return nil
}

func mapProxyPath(path string, basePath string) (string, bool) {
	rest := strings.TrimPrefix(path, "/simpleapi")
	rest = "/" + strings.TrimLeft(rest, "/")
	switch {
	case rest == "/health" || rest == "/-/health":
		return "/-/health", true
	case rest == "/api":
		return store.NormalizeBasePath(basePath), true
	case strings.HasPrefix(rest, "/api/"):
		return store.NormalizeBasePath(basePath) + strings.TrimPrefix(rest, "/api"), true
	case rest == store.NormalizeBasePath(basePath):
		return rest, true
	case strings.HasPrefix(rest, store.NormalizeBasePath(basePath)+"/"):
		return rest, true
	default:
		return "", false
	}
}

func isJSONContentType(value string) bool {
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	return contentType == "application/json" || strings.HasSuffix(contentType, "+json")
}

func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		_ = start
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				response.Error(w, http.StatusInternalServerError, "internal_error", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
