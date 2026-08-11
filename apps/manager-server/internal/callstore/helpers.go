package callstore

import "errors"

// Sentinel errors for store validation.
var (
	errMissingInternalModel = errors.New("internal_model is required")
	errMissingControlID     = errors.New("usage control id is required")
	errMissingAPIKeyName    = errors.New("api_key_name is required")
)
