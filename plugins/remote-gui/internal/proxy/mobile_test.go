package proxy

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/mobile"
)

func TestMobileFocusRequiresAuthorizedSameOriginBrowser(t *testing.T) {
	p, server := fixture(t, "http://127.0.0.1:1")
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	p.assets = root
	t.Cleanup(func() { _ = root.Close() })
	credential := enroll(t, p, server)
	calls := 0
	p.mobileLookup = func(_ context.Context, x, y int) (*mobile.Field, error) {
		calls++
		if x != 19 || y != 27 {
			t.Errorf("unexpected point: %d %d", x, y)
		}
		return &mobile.Field{Token: "phase-item", Mode: "text", X: 10, Y: 20, Width: 40, Height: 35}, nil
	}
	request := func(method, origin, content string, authorized bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, server.URL+"/__remote_gui/editable", strings.NewReader(content))
		r.Header.Set("Origin", origin)
		r.Header.Set("Sec-Fetch-Site", "same-origin")
		r.Header.Set("X-Remote-Gui-Editable", "1")
		r.Header.Set("Content-Type", "application/json")
		if authorized {
			credential.apply(r)
		}
		w := httptest.NewRecorder()
		p.ServeHTTP(w, r)
		return w
	}
	body := `{"x":19,"y":27}`
	for _, c := range []struct {
		method, origin, body string
		auth                 bool
		status               int
	}{
		{http.MethodPost, server.URL, body, true, 200},
		{http.MethodPost, "https://other.test", body, true, 403},
		{http.MethodGet, server.URL, body, true, 405},
		{http.MethodPost, server.URL, `{"x":19,"y":27,"text":"private"}`, true, 400},
		{http.MethodPost, server.URL, `{"x":19,"x":18,"y":27}`, true, 400},
		{http.MethodPost, server.URL, body, false, 403},
	} {
		w := request(c.method, c.origin, c.body, c.auth)
		if w.Code != c.status {
			t.Errorf("%v: got %d: %s", c, w.Code, w.Body.String())
		}
		if w.Code == 200 {
			result, _ := io.ReadAll(w.Result().Body)
			if !strings.Contains(string(result), `"mode":"text"`) || w.Header().Get("Cache-Control") != "no-store" {
				t.Errorf("unexpected response: %s", result)
			}
		}
	}
	if calls != 1 {
		t.Fatalf("lookups: %d", calls)
	}
	p.Revoke()
	if w := request(http.MethodPost, server.URL, body, true); w.Code != 410 || calls != 1 {
		t.Fatalf("revoked session: %d, calls: %d", w.Code, calls)
	}
}

func TestMobilePhaseDoesNotWaitForBrowserHealth(t *testing.T) {
	p, server := fixture(t, "http://127.0.0.1:1")
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	p.assets = root
	t.Cleanup(func() { _ = root.Close() })
	credential := enroll(t, p, server)
	p.mobilePhase = func() uint64 { return 2 }
	p.upstreamAlive = func() bool {
		t.Error("the phase route consulted browser health")
		return false
	}
	request := func(method, origin string, authorized bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, server.URL+editablePhasePath, nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("Sec-Fetch-Site", "same-origin")
		r.Header.Set("X-Remote-Gui-Editable", "1")
		r.Header.Set("Content-Type", "application/json")
		if authorized {
			credential.apply(r)
		}
		w := httptest.NewRecorder()
		p.ServeHTTP(w, r)
		return w
	}
	for _, tc := range []struct {
		method string
		origin string
		auth   bool
		status int
	}{
		{http.MethodPost, server.URL, true, http.StatusOK},
		{http.MethodPost, "https://other.test", true, http.StatusForbidden},
		{http.MethodGet, server.URL, true, http.StatusMethodNotAllowed},
		{http.MethodPost, server.URL, false, http.StatusForbidden},
	} {
		reply := request(tc.method, tc.origin, tc.auth)
		if reply.Code != tc.status {
			t.Errorf("%v: got %d", tc, reply.Code)
		}
		if reply.Code == http.StatusOK && strings.TrimSpace(reply.Body.String()) != "2" {
			t.Errorf("wrong phase: %s", reply.Body.String())
		}
	}
	p.Revoke()
	if reply := request(http.MethodPost, server.URL, true); reply.Code != http.StatusGone {
		t.Errorf("revoked phase endpoint returned %d", reply.Code)
	}
}
