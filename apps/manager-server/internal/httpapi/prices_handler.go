package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/response"
)

func (s *Server) listPrices(w http.ResponseWriter, r *http.Request) {
	items, err := s.callStore.ListPrices(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) upsertPrice(w http.ResponseWriter, r *http.Request) {
	var price callstore.ModelPrice
	if err := json.NewDecoder(r.Body).Decode(&price); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if err := s.callStore.UpsertPrice(r.Context(), price); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	saved, ok, err := s.callStore.GetPrice(r.Context(), price.InternalModel)
	if err != nil || !ok {
		response.JSON(w, http.StatusOK, price)
		return
	}
	response.JSON(w, http.StatusOK, saved)
}

func (s *Server) deletePrice(w http.ResponseWriter, r *http.Request) {
	internalModel := r.URL.Query().Get("model")
	if internalModel == "" {
		response.Error(w, http.StatusBadRequest, "invalid_request", "model query parameter is required")
		return
	}
	if err := s.callStore.DeletePrice(r.Context(), internalModel); err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
