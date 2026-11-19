package proxy

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
)

const editablePath = "/__remote_gui/editable"
const editablePhasePath = "/__remote_gui/editable-phase"

func focusPoint(body []byte) (int, int, bool) {
	d := json.NewDecoder(bytes.NewReader(body))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return 0, 0, false
	}
	points := make(map[string]int, 2)
	for d.More() {
		key, err := d.Token()
		if err != nil || (key != "x" && key != "y") {
			return 0, 0, false
		}
		name := key.(string)
		if _, exists := points[name]; exists {
			return 0, 0, false
		}
		var coordinate *int
		if d.Decode(&coordinate) != nil || coordinate == nil || *coordinate < 0 || *coordinate >= 4096 {
			return 0, 0, false
		}
		points[name] = *coordinate
	}
	if end, err := d.Token(); err != nil || end != json.Delim('}') || len(points) != 2 {
		return 0, 0, false
	}
	if _, err := d.Token(); err != io.EOF {
		return 0, 0, false
	}
	return points["x"], points["y"], true
}

func (p *Proxy) verifyEditableRequest(w http.ResponseWriter, r *http.Request) bool {
	for key, want := range map[string]string{
		"Origin": p.origin.String(), "Sec-Fetch-Site": "same-origin",
		"X-Remote-Gui-Editable": "1", "Content-Type": "application/json",
	} {
		values := r.Header.Values(key)
		if len(values) != 1 || values[0] != want {
			w.WriteHeader(http.StatusForbidden)
			return false
		}
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return false
	}
	return true
}

func (p *Proxy) serveEditable(w http.ResponseWriter, r *http.Request) {
	if !p.verifyEditableRequest(w, r) {
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 129))
	x, y, ok := focusPoint(body)
	if err != nil || !ok || len(body) > 128 || r.URL.RawQuery != "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	field, err := p.mobileLookup(r.Context(), x, y)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked {
		w.WriteHeader(http.StatusGone)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(field)
}

// The phase check reads only an atomic generation. It stays responsive during
// a handoff even while the browser and its lookup hold the runtime lock.
func (p *Proxy) serveEditablePhase(w http.ResponseWriter, r *http.Request) {
	if !p.verifyEditableRequest(w, r) {
		return
	}
	if r.URL.RawQuery != "" || r.ContentLength != 0 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p.mobilePhase())
}
