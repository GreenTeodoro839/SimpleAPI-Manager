package callstore

import (
	"crypto/rand"
	"encoding/hex"
)

// newID returns a 32-char hex id (128 bits of entropy) used as the stable
// primary key for usage-control records. It is deliberately decoupled from
// the api-key value or name, which can change over the key's lifetime.
func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand should not fail in practice; fall back to a zero id rather
		// than panic so a transient error never takes down the panel.
		return hex.EncodeToString(b[:])
	}
	return hex.EncodeToString(b[:])
}
