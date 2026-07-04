package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strings"

	"crypto/sha256"
	"golang.org/x/crypto/pbkdf2"
)

const Iterations = 120_000

type AdminCredential struct {
	Version    int    `json:"version"`
	Salt       string `json:"salt"`
	KeyHash    string `json:"keyHash"`
	Iterations int    `json:"iterations"`
}

func RandomToken() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func NewCredential(key string) (AdminCredential, error) {
	saltRaw := make([]byte, 16)
	if _, err := rand.Read(saltRaw); err != nil {
		return AdminCredential{}, err
	}
	salt := base64.RawURLEncoding.EncodeToString(saltRaw)
	hash := hashKey(key, salt, Iterations)
	return AdminCredential{
		Version:    1,
		Salt:       salt,
		KeyHash:    hash,
		Iterations: Iterations,
	}, nil
}

func Verify(credential AdminCredential, key string) bool {
	key = strings.TrimSpace(key)
	if key == "" || credential.Salt == "" || credential.KeyHash == "" {
		return false
	}
	iterations := credential.Iterations
	if iterations <= 0 {
		iterations = Iterations
	}
	got := hashKey(key, credential.Salt, iterations)
	return subtle.ConstantTimeCompare([]byte(got), []byte(credential.KeyHash)) == 1
}

func ExtractBearer(header string) string {
	header = strings.TrimSpace(header)
	const prefix = "Bearer "
	if len(header) >= len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
		return strings.TrimSpace(header[len(prefix):])
	}
	return ""
}

func hashKey(key string, salt string, iterations int) string {
	sum := pbkdf2.Key([]byte(key), []byte(salt), iterations, 32, sha256.New)
	return base64.RawURLEncoding.EncodeToString(sum)
}
