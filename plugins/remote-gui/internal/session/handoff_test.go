package session

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestControlResponseClearsOmittedPhaseFields(t *testing.T) {
	home := root(t)
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("unix", filepath.Join(home, id, "control.sock"))
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(View{State: "ready", Result: "ready", BrowserMode: "human"})
	})}
	go func() { _ = server.Serve(listener) }()
	defer func() { _ = server.Close() }()
	result := View{State: "ready", BrowserMode: "agent", CDPAddress: "stale-debug-endpoint", Diagnostic: "stale-diagnostic"}
	if err := control(home, id, "handoff", &result); err != nil {
		t.Fatal(err)
	}
	if result.BrowserMode != "human" || result.CDPAddress != "" || result.Diagnostic != "" {
		t.Fatal("omitted fields retained stale phase information")
	}
}

func browserFixture(t *testing.T, mode string) *browserControl {
	t.Helper()
	home := root(t)
	id, err := state.New(home)
	if err != nil {
		t.Fatal(err)
	}
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	c, err := config.Parse([]string{"start", "--home", home, "--transport", "loopback", "--browser-mode", mode})
	if err != nil {
		t.Fatal(err)
	}
	handle := BrowserHandle{
		BrowserMode: mode, Target: "http://127.0.0.1:1234/vnc.html",
		Marker: "fixture-marker", MarkerURL: "http://127.0.0.1:1235/",
		Owned: []state.Process{{Role: "browser", Identity: self}},
		Alive: func() bool { return true },
	}
	if mode == "agent" {
		handle.CDPAddress = "http://127.0.0.1:1236"
	}
	record := state.Record{
		Version: 1, ID: id, Kind: "browser", State: "ready", Config: c,
		Guard: self, Supervisor: self, Owned: handle.Owned,
		Created: time.Now(), Expires: time.Now().Add(time.Hour),
		Origin: "http://127.0.0.1:1237", Marker: handle.Marker,
		MarkerURL: handle.MarkerURL, CDPAddress: handle.CDPAddress,
	}
	if err := state.Save(home, record); err != nil {
		t.Fatal(err)
	}
	return &browserControl{home: home, id: id, handle: handle, guard: self, supervisor: self}
}

func successfulHandoff(control *browserControl, calls *atomic.Int32) {
	control.handle.Handoff = func(_ context.Context, mode string) (BrowserHandle, error) {
		calls.Add(1)
		next := control.handle
		next.BrowserMode, next.CDPAddress = mode, ""
		if mode == "agent" {
			next.CDPAddress = "http://127.0.0.1:1236"
		}
		return next, nil
	}
}

func TestBrowserHandoffResultAndIdempotency(t *testing.T) {
	control := browserFixture(t, "human")
	var calls atomic.Int32
	successfulHandoff(control, &calls)
	before, err := Read(control.home, control.id)
	if err != nil {
		t.Fatal(err)
	}
	first, err := control.handoff(context.Background(), "agent")
	if err != nil {
		t.Fatal(err)
	}
	second, err := control.handoff(context.Background(), "agent")
	if err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 || first.BrowserMode != "agent" || first.CDPAddress == "" || second.CDPAddress != first.CDPAddress {
		t.Fatal("agent handoff was missing or repeated")
	}
	if first.URL != before.URL || first.Expires != before.Expires || first.MarkerURL != before.MarkerURL {
		t.Fatal("handoff changed viewer, deadline or marker")
	}
	human, err := control.handoff(context.Background(), "human")
	if err != nil || human.BrowserMode != "human" || human.CDPAddress != "" || calls.Load() != 2 {
		t.Fatalf("human handoff: %+v %v", human, err)
	}
}

func TestConcurrentHandoffsRunOneTransition(t *testing.T) {
	control := browserFixture(t, "human")
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	control.handle.Handoff = func(context.Context, string) (BrowserHandle, error) {
		calls.Add(1)
		close(started)
		<-release
		next := control.handle
		next.BrowserMode, next.CDPAddress = "agent", "http://127.0.0.1:1236"
		return next, nil
	}
	results := make(chan error, 2)
	go func() { _, err := control.handoff(context.Background(), "agent"); results <- err }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("transition did not start")
	}
	go func() { _, err := control.handoff(context.Background(), "agent"); results <- err }()
	close(release)
	for range 2 {
		select {
		case err := <-results:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("concurrent handoff did not finish")
		}
	}
	if calls.Load() != 1 {
		t.Fatal("concurrent requests duplicated the transition")
	}
}

func TestFailedHandoffCanBeReconciled(t *testing.T) {
	control := browserFixture(t, "human")
	before, err := Read(control.home, control.id)
	if err != nil {
		t.Fatal(err)
	}
	control.handle.Handoff = func(context.Context, string) (BrowserHandle, error) {
		return control.handle, errors.New("browser-profile-still-locked")
	}
	if _, err := control.handoff(context.Background(), "agent"); err == nil {
		t.Fatal("failed transition reported success")
	}
	failed, err := state.Load(control.home, control.id)
	if err != nil || failed.State != "handoff-failed" || failed.CDPAddress != "" || failed.Config.Mode() != "human" {
		t.Fatalf("failure state: %+v %v", failed, err)
	}
	failedView, err := Read(control.home, control.id)
	if err != nil || failedView.URL != before.URL || failedView.Expires != before.Expires {
		t.Fatal("failed handoff removed the owner's recovery viewer")
	}
	var calls atomic.Int32
	successfulHandoff(control, &calls)
	recovered, err := control.handoff(context.Background(), "agent")
	if err != nil || recovered.State != "ready" || recovered.Diagnostic != "" {
		t.Fatalf("retry failed: %+v %v", recovered, err)
	}
}

func TestHandoffRejectsExpiredAndChangedOwnership(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*state.Record)
	}{
		{"expired", func(record *state.Record) { record.Expires = time.Now().Add(-time.Second) }},
		{"foreign browser", func(record *state.Record) { record.Owned[0].Identity.Start += "-foreign" }},
		{"foreign supervisor", func(record *state.Record) { record.Supervisor.Start += "-foreign" }},
		{"wrong kind", func(record *state.Record) { record.Kind = "share" }},
		{"unsupported record", func(record *state.Record) { record.Version = 99 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			control := browserFixture(t, "human")
			var calls atomic.Int32
			successfulHandoff(control, &calls)
			if err := state.Update(context.Background(), control.home, control.id, test.change); err != nil {
				t.Fatal(err)
			}
			if _, err := control.handoff(context.Background(), "agent"); err == nil || calls.Load() != 0 {
				t.Fatal("unavailable or changed session entered a transition")
			}
		})
	}
}

func TestStoppingDuringHandoffCannotReturnReady(t *testing.T) {
	control := browserFixture(t, "human")
	control.handle.Handoff = func(context.Context, string) (BrowserHandle, error) {
		err := state.Update(context.Background(), control.home, control.id, func(record *state.Record) { record.State = "stopping" })
		if err != nil {
			return control.handle, err
		}
		next := control.handle
		next.BrowserMode, next.CDPAddress = "agent", "http://127.0.0.1:1236"
		return next, nil
	}
	if _, err := control.handoff(context.Background(), "agent"); err == nil {
		t.Fatal("stopping session reported a successful handoff")
	}
	record, err := state.Load(control.home, control.id)
	if err != nil || record.State != "stopping" || record.CDPAddress != "" {
		t.Fatalf("stop state overwritten: %+v %v", record, err)
	}
}

func TestLegacyBrowserViewDefaultsToAgent(t *testing.T) {
	control := browserFixture(t, "agent")
	if err := state.Update(context.Background(), control.home, control.id, func(record *state.Record) { record.Config.BrowserMode = "" }); err != nil {
		t.Fatal(err)
	}
	got, err := Read(control.home, control.id)
	if err != nil || got.BrowserMode != "agent" || got.CDPAddress == "" {
		t.Fatalf("legacy browser changed: %+v %v", got, err)
	}
}
