package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
)

const viewportPath = "/__remote_gui/viewport"

type viewportRequest struct {
	ViewerID string `json:"viewer_id"`
	Sequence uint64 `json:"sequence"`
	Claim    bool   `json:"claim"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}
type viewportEntry struct {
	sequence uint64
	seen     time.Time
}

// decodeViewport also refuses duplicates and nulls, which a struct decoder alone accepts.
func decodeViewport(body []byte) (viewportRequest, bool) {
	var request viewportRequest
	if !utf8.Valid(body) {
		return request, false
	}
	d := json.NewDecoder(bytes.NewReader(body))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return request, false
	}
	fields := make(map[string]json.RawMessage)
	for d.More() {
		key, e := d.Token()
		if e != nil {
			return request, false
		}
		name, ok := key.(string)
		if !ok {
			return request, false
		}
		if _, exists := fields[name]; exists {
			return request, false
		}
		var raw json.RawMessage
		if d.Decode(&raw) != nil || bytes.Equal(raw, []byte("null")) {
			return request, false
		}
		fields[name] = raw
	}
	if _, err = d.Token(); err != nil {
		return request, false
	}
	if _, err = d.Token(); err != io.EOF {
		return request, false
	}
	if len(fields) != 5 {
		return request, false
	}
	values := map[string]any{"viewer_id": &request.ViewerID, "sequence": &request.Sequence, "claim": &request.Claim, "width": &request.Width, "height": &request.Height}
	for key, raw := range fields {
		value, ok := values[key]
		if !ok || json.Unmarshal(raw, value) != nil {
			return request, false
		}
	}
	return request, config.ValidID(request.ViewerID) && request.Sequence > 0 && request.Sequence <= 9007199254740991 && (viewport.Size{Width: request.Width, Height: request.Height}).Valid()
}

func viewportReply(w http.ResponseWriter, status int, result string, size viewport.Size, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Result string `json:"result,omitempty"`
		Width  int    `json:"width,omitempty"`
		Height int    `json:"height,omitempty"`
		Error  string `json:"error,omitempty"`
	}{result, size.Width, size.Height, code})
}

func (p *Proxy) serveViewport(w http.ResponseWriter, r *http.Request) {
	fail := func(status int, code string) { viewportReply(w, status, "", viewport.Size{}, code) }
	for key, want := range map[string]string{"Origin": p.origin.String(), "Sec-Fetch-Site": "same-origin", "X-Remote-Gui-Viewport": "1", "Content-Type": "application/json"} {
		values := r.Header.Values(key)
		if len(values) != 1 || values[0] != want {
			fail(403, "viewport-request-refused")
			return
		}
	}
	if r.Method != http.MethodPost {
		fail(405, "viewport-method-not-allowed")
		return
	}
	if r.URL.RawQuery != "" {
		fail(400, "viewport-request-invalid")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1025))
	if err != nil || len(body) > 1024 {
		fail(400, "viewport-request-invalid")
		return
	}
	req, ok := decodeViewport(body)
	if !ok {
		fail(400, "viewport-request-invalid")
		return
	}
	p.viewportMu.Lock()
	defer p.viewportMu.Unlock()
	p.mu.Lock()
	ended := p.revoked || !time.Now().Before(p.deadline)
	p.mu.Unlock()
	if ended {
		fail(410, "viewport-session-ended")
		return
	}
	now := time.Now()
	if p.viewportNow != nil {
		now = p.viewportNow()
	}
	if p.viewportEntries == nil {
		p.viewportEntries = make(map[string]viewportEntry)
	}
	for id, entry := range p.viewportEntries {
		if id != p.viewportActive && now.Sub(entry.seen) > 30*time.Minute {
			delete(p.viewportEntries, id)
		}
	}
	entry, exists := p.viewportEntries[req.ViewerID]
	if (exists && req.Sequence <= entry.sequence) || (!req.Claim && p.viewportActive != req.ViewerID) {
		viewportReply(w, 200, "inactive", viewport.Size{}, "")
		return
	}
	if !exists && len(p.viewportEntries) >= 16 {
		fail(429, "viewport-viewer-limit")
		return
	}
	p.viewportEntries[req.ViewerID] = viewportEntry{req.Sequence, now}
	if req.Claim {
		p.viewportActive = req.ViewerID
	}
	if p.viewportActive != req.ViewerID {
		viewportReply(w, 200, "inactive", viewport.Size{}, "")
		return
	}
	size := viewport.Size{Width: req.Width, Height: req.Height}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	unchanged, err := p.resize(ctx, size)
	if err != nil {
		if err.Error() == "viewport-busy" {
			fail(409, "viewport-busy")
		} else {
			fail(503, "viewport-unavailable")
		}
		return
	}
	result := "applied"
	if unchanged {
		result = "unchanged"
	}
	viewportReply(w, 200, result, size, "")
}
