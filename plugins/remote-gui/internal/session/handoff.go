package session

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// The supervisor owns this handle for the entire viewer lifetime.
type browserControl struct {
	mu                sync.RWMutex
	home, id          string
	handle            BrowserHandle
	guard, supervisor state.Identity
}

func (h BrowserHandle) healthy() bool {
	if h.Alive != nil {
		return h.Alive()
	}
	for _, process := range h.Owned {
		if !state.Alive(process.Identity) {
			return false
		}
	}
	return true
}

func (b *browserControl) alive() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.handle.healthy()
}

func (b *browserControl) bound(record state.Record) bool {
	return record.Kind == "browser" && state.Equal(record.Guard, b.guard) && state.Equal(record.Supervisor, b.supervisor) && state.Alive(b.guard) && state.Alive(b.supervisor)
}

func (b *browserControl) change(ctx context.Context, expected string, apply func(*state.Record)) (state.Record, error) {
	release, err := state.Lock(ctx, b.home)
	if err != nil {
		return state.Record{}, err
	}
	defer release()
	record, err := state.Load(b.home, b.id)
	if err != nil {
		return record, err
	}
	if !b.bound(record) || record.State != expected || !time.Now().Before(record.Expires) {
		return record, errors.New("browser-handoff-state-changed")
	}
	apply(&record)
	err = state.Save(b.home, record)
	return record, err
}

func (b *browserControl) handoff(ctx context.Context, mode string) (View, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if mode != "human" && mode != "agent" {
		return View{}, errors.New("invalid-browser-mode")
	}
	if ctx.Err() != nil {
		return View{}, errors.New("browser-handoff-request-expired")
	}
	record, err := state.Load(b.home, b.id)
	if err != nil {
		return View{}, err
	}
	if !b.bound(record) || !slices.Equal(record.Owned, b.handle.Owned) || !time.Now().Before(record.Expires) {
		return view(record, false), errors.New("browser-session-ownership-or-lifetime-changed")
	}
	if (record.State != "ready" && record.State != "handoff-failed") || b.handle.Handoff == nil {
		return view(record, false), errors.New("browser-handoff-unavailable")
	}
	if record.State == "ready" && record.Config.Mode() == mode && b.handle.BrowserMode == mode && b.handle.healthy() {
		return view(record, true), nil
	}
	record, err = b.change(ctx, record.State, func(current *state.Record) {
		current.State, current.CDPAddress, current.Diagnostic = "handoff", "", ""
	})
	if err != nil {
		return view(record, false), err
	}
	transition, cancel := context.WithDeadline(ctx, minTime(time.Now().Add(25*time.Second), record.Expires))
	defer cancel()
	previous := b.handle
	next, transitionErr := b.handle.Handoff(transition, mode)
	if next.Target == "" {
		next = previous
		transitionErr = errors.New("browser-handoff-result-unavailable")
	}
	b.handle = next
	if transitionErr == nil && (transition.Err() != nil || next.BrowserMode != mode || !next.healthy() || next.Target != previous.Target || next.MarkerURL != previous.MarkerURL || next.Marker != previous.Marker) {
		transitionErr = errors.New("browser-handoff-result-unverified")
	}
	if transitionErr == nil && ((mode == "human" && next.CDPAddress != "") || (mode == "agent" && next.CDPAddress == "")) {
		transitionErr = errors.New("browser-control-boundary-unverified")
	}
	finalize, stop := context.WithTimeout(context.Background(), 3*time.Second)
	defer stop()
	record, err = b.change(finalize, "handoff", func(current *state.Record) {
		current.Owned, current.CDPAddress = next.Owned, ""
		if next.BrowserMode == "human" || next.BrowserMode == "agent" {
			current.Config.BrowserMode = next.BrowserMode
		}
		if transitionErr != nil {
			current.State, current.Diagnostic = "handoff-failed", transitionErr.Error()
			return
		}
		current.State, current.CDPAddress, current.Diagnostic = "ready", next.CDPAddress, ""
	})
	if err != nil {
		return view(record, false), err
	}
	return view(record, true), transitionErr
}

func (b *browserControl) serveHandoff(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(30 * time.Second)); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	v, err := b.handoff(req.Context(), req.URL.Query().Get("browser-mode"))
	if err != nil {
		v.Result, v.Diagnostic = "handoff-failed", err.Error()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func Handoff(home, id, mode string) (View, error) {
	v, err := Read(home, id)
	if err != nil {
		return v, err
	}
	if v.Kind != "browser" {
		return v, errors.New("handoff-requires-browser-session")
	}
	if mode != "human" && mode != "agent" {
		return v, errors.New("invalid-browser-mode")
	}
	err = controlTimeout(home, id, "handoff?browser-mode="+mode, &v, 35*time.Second)
	if err != nil {
		return v, err
	}
	if v.State != "ready" || v.Result != "ready" || v.BrowserMode != mode {
		if v.Diagnostic == "" {
			return v, errors.New("browser-handoff-incomplete")
		}
		return v, errors.New(v.Diagnostic)
	}
	return v, nil
}
