package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/response"
)

// quotaWindow is one window's credit/token breakdown for the public quota page.
type quotaWindow struct {
	Used      float64            `json:"used"`
	Available float64            `json:"available"`
	Limit     float64            `json:"limit"`
	Tokens    callstore.TokenSums `json:"tokens"`
}

type quotaRecentItem struct {
	Model      string               `json:"model"`
	Protocol   string               `json:"protocol"`
	HTTPStatus int                  `json:"http_status"`
	Failed     bool                 `json:"failed"`
	Time       string               `json:"time"`
	DurationMS int64                `json:"duration_ms"`
	Tokens     callstore.TokenSums  `json:"tokens"`
}

type quotaResponse struct {
	Configured bool              `json:"configured"`
	APIKeyName string            `json:"api_key_name,omitempty"`
	Limit5h    float64           `json:"limit_5h,omitempty"`
	LimitWeek  float64           `json:"limit_week,omitempty"`
	Usage5h    *quotaWindow      `json:"usage_5h,omitempty"`
	UsageWeek  *quotaWindow      `json:"usage_week,omitempty"`
	Recent     []quotaRecentItem `json:"recent,omitempty"`
}

// quota is a PUBLIC endpoint (no admin auth). The caller supplies their api-key
// value via ?key=. Control lookup happens first; on a miss we return
// {configured:false} without any SimpleAPI round-trip (uniform + cheap).
func (s *Server) quota(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" {
		response.JSON(w, http.StatusOK, quotaResponse{Configured: false})
		return
	}
	controls, err := s.callStore.ListControls(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	var control *callstore.UsageControl
	for i := range controls {
		c := &controls[i]
		if c.APIKeyValue == key || c.APIKeyName == key {
			control = c
			break
		}
	}
	if control == nil {
		response.JSON(w, http.StatusOK, quotaResponse{Configured: false})
		return
	}

	prices, err := s.callStore.LoadPriceMap(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	ids := callstore.DedupeIdentifiers(control.APIKeyName, control.APIKeyValue)
	now := time.Now().UnixMilli()
	entries5h, err := s.callStore.EntriesByKey(r.Context(), ids, now-window5h.Milliseconds(), 0)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	entriesWeek, err := s.callStore.EntriesByKey(r.Context(), ids, now-windowWeek.Milliseconds(), 0)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	used5h := callstore.CostForEntries(entries5h, prices, time.Local)
	usedWeek := callstore.CostForEntries(entriesWeek, prices, time.Local)

	// Resolve aliasB server-side (do NOT echo the raw models[] config publicly).
	aliasBByModel := map[string]string{}
	if keyObj, ok, err := s.findAPIKey(r.Context(), control.APIKeyName, control.APIKeyValue); err == nil && ok {
		for _, m := range keyObj.Models {
			if strings.TrimSpace(m.AliasB) != "" {
				aliasBByModel[m.Model] = m.AliasB
			}
		}
	}

	recentEntries, err := s.callStore.RecentByKey(r.Context(), ids, 50)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	recent := make([]quotaRecentItem, 0, len(recentEntries))
	for _, e := range recentEntries {
		recent = append(recent, quotaRecentItem{
			Model:      resolveModelName(e.InternalModel, e.Alias, aliasBByModel),
			Protocol:   e.SourceProtocol,
			HTTPStatus: e.HTTPStatus,
			Failed:     e.Failed,
			Time:       e.Timestamp.UTC().Format(time.RFC3339),
			DurationMS: e.LatencyMS,
			Tokens: callstore.TokenSums{
				InputTokens:         e.Tokens.InputTokens,
				OutputTokens:        e.Tokens.OutputTokens,
				CacheReadTokens:     e.Tokens.CacheReadTokens,
				CacheCreationTokens: e.Tokens.CacheCreationTokens,
				CachedTokens:        e.Tokens.CachedTokens,
				ReasoningTokens:     e.Tokens.ReasoningTokens,
				TotalTokens:         e.Tokens.TotalTokens,
			},
		})
	}

	response.JSON(w, http.StatusOK, quotaResponse{
		Configured: true,
		APIKeyName: control.APIKeyName,
		Limit5h:    control.Limit5h,
		LimitWeek:  control.LimitWeek,
		Usage5h:    makeWindow(used5h, control.Limit5h, callstore.SumEntryTokens(entries5h)),
		UsageWeek:  makeWindow(usedWeek, control.LimitWeek, callstore.SumEntryTokens(entriesWeek)),
		Recent:     recent,
	})
}

// makeWindow assembles one window's credit totals and token breakdown. A
// non-positive limit means "no limit for this window" → available reads as 0.
func makeWindow(used, limit float64, tokens callstore.TokenSums) *quotaWindow {
	available := float64(0)
	if limit > 0 {
		available = limit - used
		if available < 0 {
			available = 0
		}
	}
	return &quotaWindow{Used: used, Available: available, Limit: limit, Tokens: tokens}
}

// resolveModelName returns aliasB when configured for the model, else the
// aliasA portion of the internal_model, else the raw log alias.
func resolveModelName(internalModel, logAlias string, aliasBByModel map[string]string) string {
	if aliasB, ok := aliasBByModel[internalModel]; ok && aliasB != "" {
		return aliasB
	}
	if i := strings.Index(internalModel, "/"); i >= 0 && i < len(internalModel)-1 {
		return internalModel[i+1:]
	}
	if logAlias != "" {
		return logAlias
	}
	return internalModel
}
