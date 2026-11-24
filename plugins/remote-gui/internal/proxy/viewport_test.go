package proxy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/viewport"
)

func viewportFixture(t *testing.T) (*Proxy, *httptest.Server, *testCredential, *[]viewport.Size) {
	t.Helper()
	p, s := fixture(t, "http://127.0.0.1:1")
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	p.assets = root
	calls := new([]viewport.Size)
	p.resize = func(_ context.Context, size viewport.Size) (bool, error) {
		*calls = append(*calls, size)
		return false, nil
	}
	return p, s, enroll(t, p, s), calls
}

func viewportBody(id string, seq int, claim bool) string {
	return fmt.Sprintf(`{"viewer_id":"%032s","sequence":%d,"claim":%t,"width":390,"height":812}`, id, seq, claim)
}

func sendViewport(t *testing.T, s *httptest.Server, c *testCredential, body string, edit func(*http.Request)) (int, string) {
	t.Helper()
	r, err := http.NewRequest(http.MethodPost, s.URL+"/__remote_gui/viewport", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Origin", s.URL)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Remote-Gui-Viewport", "1")
	if c != nil {
		c.apply(r)
	}
	if edit != nil {
		edit(r)
	}
	reply, err := s.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reply.Body.Close() }()
	var data struct {
		Result string `json:"result"`
	}
	_ = json.NewDecoder(reply.Body).Decode(&data)
	return reply.StatusCode, data.Result
}

func TestViewportValidation(t *testing.T) {
	cases := []struct {
		name string
		body string
		edit func(*http.Request)
	}{
		{"missing origin", "", func(r *http.Request) { r.Header.Del("Origin") }},
		{"foreign origin", "", func(r *http.Request) { r.Header.Set("Origin", "https://foreign.invalid") }},
		{"duplicate origin", "", func(r *http.Request) { r.Header.Add("Origin", r.Header.Get("Origin")) }},
		{"missing site", "", func(r *http.Request) { r.Header.Del("Sec-Fetch-Site") }},
		{"foreign site", "", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }},
		{"duplicate site", "", func(r *http.Request) { r.Header.Add("Sec-Fetch-Site", "same-origin") }},
		{"missing marker", "", func(r *http.Request) { r.Header.Del("X-Remote-Gui-Viewport") }},
		{"duplicate marker", "", func(r *http.Request) { r.Header.Add("X-Remote-Gui-Viewport", "1") }},
		{"content type", "", func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }},
		{"duplicate type", "", func(r *http.Request) { r.Header.Add("Content-Type", "application/json") }},
		{"query", "", func(r *http.Request) { r.URL.RawQuery = "x=1" }},
		{"method", "", func(r *http.Request) { r.Method = "PUT" }},
		{"malformed", "{", nil},
		{"large", strings.Repeat("x", 1025), nil},
		{"duplicate field", `{"viewer_id":"0000000000000000000000000000000a","sequence":1,"claim":true,"width":390,"width":900,"height":812}`, nil},
	}
	valid := viewportBody("a", 1, true)
	for _, field := range []string{`"sequence":0`, `"sequence":9007199254740992`, `"width":319`, `"width":4097`, `"height":239`, `"height":4097`, `"width":390.5`, `"viewer_id":"invalid"`, `"claim":null`} {
		parts := strings.SplitN(field, ":", 2)
		key := parts[0]
		start := strings.Index(valid, key)
		end := strings.Index(valid[start:], ",")
		if end < 0 {
			end = len(valid) - start - 1
		}
		body := valid[:start] + field + valid[start+end:]
		cases = append(cases, struct {
			name string
			body string
			edit func(*http.Request)
		}{field, body, nil})
	}
	cases = append(cases, struct {
		name string
		body string
		edit func(*http.Request)
	}{"unknown", strings.TrimSuffix(valid, "}") + `,"other":1}`, nil})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, s, c, calls := viewportFixture(t)
			body := tc.body
			if body == "" {
				body = valid
			}
			code, _ := sendViewport(t, s, c, body, tc.edit)
			if code < 400 {
				t.Fatalf("invalid request accepted: %d", code)
			}
			if len(*calls) != 0 {
				t.Fatal("invalid request reached backend")
			}
		})
	}
}

func TestViewportControlAndBusyRetry(t *testing.T) {
	p, s, c, calls := viewportFixture(t)
	for _, step := range []struct {
		id     string
		seq    int
		claim  bool
		result string
	}{{"b", 1, true, "applied"}, {"a", 1, true, "applied"}, {"b", 2, false, "inactive"}, {"a", 1, true, "inactive"}, {"a", 2, false, "applied"}} {
		code, result := sendViewport(t, s, c, viewportBody(step.id, step.seq, step.claim), nil)
		if code != 200 || result != step.result {
			t.Fatalf("step %+v: %d %s", step, code, result)
		}
	}
	if len(*calls) != 3 {
		t.Fatalf("calls %d", len(*calls))
	}
	p.resize = func(context.Context, viewport.Size) (bool, error) { return false, errors.New("viewport-busy") }
	code, _ := sendViewport(t, s, c, viewportBody("a", 3, true), nil)
	if code != 409 {
		t.Fatalf("busy %d", code)
	}
	p.resize = func(context.Context, viewport.Size) (bool, error) { return true, nil }
	_, _ = sendViewport(t, s, c, viewportBody("b", 3, true), nil)
	_, result := sendViewport(t, s, c, viewportBody("a", 4, false), nil)
	if result != "inactive" {
		t.Fatal("retry reacquired control")
	}
}

func TestViewportBoundAndExpiry(t *testing.T) {
	p, s, c, _ := viewportFixture(t)
	now := time.Now()
	p.viewportNow = func() time.Time { return now }
	for i := 0; i < 16; i++ {
		code, _ := sendViewport(t, s, c, viewportBody(fmt.Sprintf("%x", i), 1, true), nil)
		if code != 200 {
			t.Fatal(code)
		}
	}
	code, _ := sendViewport(t, s, c, viewportBody("ff", 1, true), nil)
	if code != 429 {
		t.Fatalf("unbounded viewers %d", code)
	}
	now = now.Add(31 * time.Minute)
	code, _ = sendViewport(t, s, c, viewportBody("ff", 2, true), nil)
	if code != 200 {
		t.Fatalf("expired viewers not reclaimed %d", code)
	}
}

func TestViewportSessionBoundary(t *testing.T) {
	p, s, c, calls := viewportFixture(t)
	code, _ := sendViewport(t, s, nil, viewportBody("a", 1, true), nil)
	if code == 200 || len(*calls) != 0 {
		t.Fatal("unauthenticated resize")
	}
	p.mu.Lock()
	p.deadline = time.Now().Add(-time.Second)
	p.mu.Unlock()
	code, _ = sendViewport(t, s, c, viewportBody("a", 1, true), nil)
	if code != 410 {
		t.Fatal(code)
	}
	p.Revoke()
	revoked := httptest.NewRequest(http.MethodPost, s.URL+viewportPath, strings.NewReader(viewportBody("a", 2, true)))
	revoked.Header.Set("Origin", s.URL)
	response := httptest.NewRecorder()
	p.ServeHTTP(response, revoked)
	if response.Code != 410 || len(*calls) != 0 {
		t.Fatal("revoked session accepted sizing")
	}
	_, share, cc := func() (*Proxy, *httptest.Server, *testCredential) {
		p, s := fixture(t, "http://127.0.0.1:1")
		return p, s, enroll(t, p, s)
	}()
	code, _ = sendViewport(t, share, cc, viewportBody("a", 1, true), nil)
	if code != 404 {
		t.Fatalf("share exposed geometry %d", code)
	}
}

func TestViewportConcurrentClaims(t *testing.T) {
	p, s, c, _ := viewportFixture(t)
	entered, release := make(chan struct{}), make(chan struct{})
	var calls int
	p.resize = func(ctx context.Context, _ viewport.Size) (bool, error) {
		calls++
		if calls == 1 {
			close(entered)
			select {
			case <-release:
			case <-ctx.Done():
				return false, ctx.Err()
			}
		}
		return false, nil
	}
	done := make(chan int, 2)
	go func() { code, _ := sendViewport(t, s, c, viewportBody("a", 1, true), nil); done <- code }()
	<-entered
	go func() { code, _ := sendViewport(t, s, c, viewportBody("b", 1, true), nil); done <- code }()
	close(release)
	for range 2 {
		if code := <-done; code != 200 {
			t.Fatal(code)
		}
	}
	_, result := sendViewport(t, s, c, viewportBody("a", 2, false), nil)
	if result != "inactive" || calls != 2 {
		t.Fatal("queued claims were not serialized")
	}
}

func TestViewportRouteNeedsOwnerIdentity(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "p.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	seed, err := net.Dial("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	back, err := listener.Accept()
	if err != nil {
		t.Fatal(err)
	}
	peer, err := state.ReadPeer(seed)
	if err != nil {
		t.Fatal(err)
	}
	_ = seed.Close()
	_ = back.Close()
	calls := 0
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "https://owner.test:12000", Target: "http://127.0.0.1:1", Deadline: time.Now().Add(time.Minute), OwnerLogin: "owner@example.test", ServePeer: peer, ViewerAssets: viewerAssets(t), ViewerPassword: "synthetic", Resize: func(context.Context, viewport.Size) (bool, error) { calls++; return false, nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer p.Revoke()
	server := &http.Server{Handler: p, ConnContext: p.ConnContext, ConnState: p.ConnState, ReadHeaderTimeout: time.Second}
	go func() { _ = server.Serve(listener) }()
	defer func() { _ = server.Close() }()
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: time.Second}
	for _, owner := range []string{"", "someone-else@example.test", "owner@example.test"} {
		request, err := http.NewRequest(http.MethodPost, "http://localhost/__remote_gui/viewport", strings.NewReader(viewportBody("a", 1, true)))
		if err != nil {
			t.Fatal(err)
		}
		for key, value := range map[string]string{"Origin": "https://owner.test:12000", "X-Forwarded-Host": "owner.test:12000", "X-Forwarded-Proto": "https", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "X-Remote-Gui-Viewport": "1"} {
			request.Header.Set(key, value)
		}
		if owner != "" {
			request.Header.Set("Tailscale-User-Login", owner)
		}
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if owner == "owner@example.test" {
			if response.StatusCode != 200 || calls != 1 {
				t.Fatalf("owner refused: %d, calls %d", response.StatusCode, calls)
			}
		} else if response.StatusCode == 200 || calls != 0 {
			t.Fatal("foreign identity reached native sizing")
		}
	}
}

func TestViewportInactiveSequencePreventsOlderClaim(t *testing.T) {
	_, s, c, calls := viewportFixture(t)
	for _, step := range []struct {
		id       string
		sequence int
		claim    bool
		result   string
		calls    int
	}{
		{"b", 1, true, "applied", 1},
		{"a", 1, true, "applied", 2},
		{"b", 3, false, "inactive", 2},
		{"b", 2, true, "inactive", 2},
		{"b", 3, true, "inactive", 2},
		{"a", 2, false, "applied", 3},
		{"b", 4, true, "applied", 4},
	} {
		code, result := sendViewport(t, s, c, viewportBody(step.id, step.sequence, step.claim), nil)
		if code != 200 || result != step.result || len(*calls) != step.calls {
			t.Fatalf("viewer %s sequence %d claim %v: status=%d result=%s backend calls=%d; want %s and %d calls", step.id, step.sequence, step.claim, code, result, len(*calls), step.result, step.calls)
		}
	}
}

func TestViewportUnknownUpdatesDoNotReserveEntries(t *testing.T) {
	p, s, c, calls := viewportFixture(t)
	for i := range 17 {
		code, result := sendViewport(t, s, c, viewportBody(fmt.Sprintf("%x", i), 9, false), nil)
		if code != 200 || result != "inactive" {
			t.Fatalf("unknown non-claim: %d %s", code, result)
		}
	}
	p.viewportMu.Lock()
	entries := len(p.viewportEntries)
	p.viewportMu.Unlock()
	if entries != 0 || len(*calls) != 0 {
		t.Fatal("unregistered measurements reserved viewer entries or resized")
	}
	code, result := sendViewport(t, s, c, viewportBody("a", 1, true), nil)
	if code != 200 || result != "applied" || len(*calls) != 1 {
		t.Fatal("unknown updates blocked a subsequent first claim")
	}
}
