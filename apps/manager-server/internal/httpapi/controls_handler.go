package httpapi

import (
	"errors"
	"log"
	"net/http"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/response"
)

// controlPayload is the admin-facing create/update request body.
type controlPayload struct {
	APIKeyName  string  `json:"api_key_name"`
	APIKeyValue string  `json:"api_key_value"`
	Limit5h     float64 `json:"limit_5h"`
	LimitWeek   float64 `json:"limit_week"`
}

func (s *Server) listControls(w http.ResponseWriter, r *http.Request) {
	controls, err := s.callStore.ListControls(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	prices, err := s.callStore.LoadPriceMap(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	for i := range controls {
		controls[i].Usage5h, controls[i].UsageWeek = s.computeControlUsage(r.Context(), controls[i], prices)
	}
	response.JSON(w, http.StatusOK, map[string]any{"items": controls})
}

func (s *Server) createControl(w http.ResponseWriter, r *http.Request) {
	var req controlPayload
	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.APIKeyName == "" {
		response.Error(w, http.StatusBadRequest, "invalid_request", "api_key_name is required")
		return
	}
	// Resolve the raw key value from SimpleAPI so usage matching is robust.
	value := req.APIKeyValue
	if key, ok, err := s.findAPIKey(r.Context(), req.APIKeyName, value); err != nil {
		response.Error(w, http.StatusBadGateway, "upstream_error", "could not reach SimpleAPI to resolve api-key: "+err.Error())
		return
	} else if ok {
		value = key.Key
	} else {
		response.Error(w, http.StatusBadRequest, "invalid_request", "api-key not found upstream")
		return
	}
	control := callstore.UsageControl{
		APIKeyName: req.APIKeyName, APIKeyValue: value,
		Limit5h: req.Limit5h, LimitWeek: req.LimitWeek,
	}
	saved, err := s.callStore.CreateControl(r.Context(), control)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	s.enforceBackground()
	response.JSON(w, http.StatusOK, saved)
}

func (s *Server) updateControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	existing, ok, err := s.callStore.GetControl(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	if !ok {
		response.Error(w, http.StatusNotFound, "not_found", "usage control not found")
		return
	}
	var req controlPayload
	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.APIKeyName == "" {
		response.Error(w, http.StatusBadRequest, "invalid_request", "api_key_name is required")
		return
	}
	value := req.APIKeyValue
	// Re-resolve the raw value when the name changes and no value was supplied.
	if value == "" || req.APIKeyName != existing.APIKeyName {
		if key, found, err := s.findAPIKey(r.Context(), req.APIKeyName, value); err == nil && found {
			value = key.Key
		} else if err != nil && !errors.Is(err, errSimpleAPINotConfigured) {
			log.Printf("update-control: resolve value for %s: %v", req.APIKeyName, err)
		}
	}
	updated := existing
	updated.APIKeyName = req.APIKeyName
	updated.APIKeyValue = value
	updated.Limit5h = req.Limit5h
	updated.LimitWeek = req.LimitWeek
	if err := s.callStore.UpdateControl(r.Context(), updated); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	saved, _, _ := s.callStore.GetControl(r.Context(), id)
	s.enforceBackground()
	response.JSON(w, http.StatusOK, saved)
}

func (s *Server) deleteControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	existing, ok, err := s.callStore.GetControl(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	if !ok {
		response.JSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	// If we auto-disabled this key, lift the disable before removing the control
	// so the key isn't left stuck. Best-effort: delete regardless.
	if existing.AutoDisabled {
		if err := s.setAPIKeyEnabled(r.Context(), existing.APIKeyName, true); err != nil {
			log.Printf("delete-control: re-enable %s failed (control %s will still be deleted): %v", existing.APIKeyName, id, err)
		}
	}
	if err := s.callStore.DeleteControl(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
