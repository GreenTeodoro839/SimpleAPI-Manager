package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/security"
)

type SimpleAPIConnection struct {
	BaseURL       string `json:"baseUrl"`
	ManagementKey string `json:"managementKey,omitempty"`
	BasePath      string `json:"basePath"`
	UpdatedAtMS   int64  `json:"updatedAtMs,omitempty"`
}

type PublicConnection struct {
	BaseURL          string `json:"baseUrl"`
	BasePath         string `json:"basePath"`
	ManagementKey    string `json:"managementKey,omitempty"`
	ManagementKeySet bool   `json:"managementKeySet"`
	UpdatedAtMS      int64  `json:"updatedAtMs,omitempty"`
}

type persisted struct {
	AdminCredential security.AdminCredential `json:"adminCredential"`
	Connection      SimpleAPIConnection      `json:"connection"`
}

type Store struct {
	mu   sync.RWMutex
	path string
	data persisted
}

func Open(dataDir string, adminKey string, randomToken func() (string, error)) (*Store, string, error) {
	if strings.TrimSpace(dataDir) == "" {
		dataDir = "./data"
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, "", err
	}
	st := &Store{path: filepath.Join(dataDir, "manager.json")}
	if err := st.load(); err != nil {
		return nil, "", err
	}
	if st.data.AdminCredential.KeyHash != "" {
		return st, "", nil
	}
	key := strings.TrimSpace(adminKey)
	generated := ""
	if key == "" {
		var err error
		key, err = randomToken()
		if err != nil {
			return nil, "", err
		}
		generated = key
	}
	cred, err := security.NewCredential(key)
	if err != nil {
		return nil, "", err
	}
	st.data.AdminCredential = cred
	if err := st.saveLocked(); err != nil {
		return nil, "", err
	}
	return st, generated, nil
}

func (s *Store) VerifyAdminKey(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return security.Verify(s.data.AdminCredential, key)
}

func (s *Store) SaveConnection(conn SimpleAPIConnection) error {
	conn.BaseURL = NormalizeBaseURL(conn.BaseURL)
	conn.BasePath = NormalizeBasePath(conn.BasePath)
	conn.ManagementKey = strings.TrimSpace(conn.ManagementKey)
	conn.UpdatedAtMS = time.Now().UnixMilli()
	if conn.BaseURL == "" {
		return errors.New("baseUrl is required")
	}
	if conn.ManagementKey == "" {
		return errors.New("managementKey is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Connection = conn
	return s.saveLocked()
}

func (s *Store) Connection() (SimpleAPIConnection, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	conn := s.data.Connection
	return conn, conn.BaseURL != "" && conn.ManagementKey != ""
}

func (s *Store) PublicConnection() (PublicConnection, bool) {
	conn, ok := s.Connection()
	return PublicConnection{
		BaseURL:          conn.BaseURL,
		BasePath:         NormalizeBasePath(conn.BasePath),
		ManagementKey:    conn.ManagementKey,
		ManagementKeySet: conn.ManagementKey != "",
		UpdatedAtMS:      conn.UpdatedAtMS,
	}, ok
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, &s.data); err != nil {
		return fmt.Errorf("parse %s: %w", s.path, err)
	}
	return nil
}

func (s *Store) saveLocked() error {
	data, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func NormalizeBaseURL(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	value = strings.TrimRight(value, "/")
	value = strings.TrimSuffix(value, "/-/api")
	value = strings.TrimSuffix(value, "/-/health")
	return value
}

func NormalizeBasePath(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "/-/api"
	}
	if !strings.HasPrefix(value, "/") {
		value = "/" + value
	}
	return strings.TrimRight(value, "/")
}
