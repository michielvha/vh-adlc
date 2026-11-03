package tailnet

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

type mockAPI struct {
	mu         sync.Mutex
	doc        Document
	version    int
	posts      int
	etag       bool
	beforePost func(*mockAPI)
}

func mock(t *testing.T) (*mockAPI, *Client) {
	t.Helper()
	m := &mockAPI{doc: Document{"future": json.RawMessage(`{"large":1234567890123456789012345}`)}, version: 1, etag: true}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		defer m.mu.Unlock()
		if r.URL.Path == "/localapi/v0/status" {
			_, _ = io.WriteString(w, `{"BackendState":"Running","Self":{"DNSName":"fixture.example.ts.net."},"CertDomains":["fixture.example.ts.net"]}`)
			return
		}
		switch r.Method {
		case http.MethodGet:
			if m.etag {
				w.Header().Set("ETag", fmt.Sprintf(`"%d"`, m.version))
			}
			_ = json.NewEncoder(w).Encode(m.doc)
		case http.MethodPost:
			m.posts++
			if m.beforePost != nil {
				hook := m.beforePost
				m.beforePost = nil
				hook(m)
			}
			if r.Header.Get("If-Match") != fmt.Sprintf(`"%d"`, m.version) {
				w.WriteHeader(http.StatusPreconditionFailed)
				return
			}
			if err := json.NewDecoder(r.Body).Decode(&m.doc); err != nil {
				w.WriteHeader(400)
				return
			}
			m.version++
			w.WriteHeader(200)
		}
	}))
	t.Cleanup(s.Close)
	return m, &Client{Base: s.URL, HTTP: s.Client()}
}

func mapping() *state.Forward {
	return &state.Forward{Port: 14567, Host: "fixture.example.ts.net", Target: "http://127.0.0.1:34567"}
}

func TestInstallRemovePreservesForeignConfig(t *testing.T) {
	m, c := mock(t)
	m.doc["TCP"] = json.RawMessage(`{"443":{"HTTPS":true}}`)
	m.doc["Web"] = json.RawMessage(`{"fixture.example.ts.net:443":{"Handlers":{"/":{"Text":"foreign"}}}}`)
	before, _ := json.Marshal(m.doc)
	forward := mapping()
	intent := false
	if err := c.Install(context.Background(), forward, func(*state.Forward) error { intent = true; return nil }); err != nil {
		t.Fatal(err)
	}
	if !intent || m.posts != 1 {
		t.Fatal("mapping mutation did not persist intent first")
	}
	if err := c.Remove(context.Background(), forward); err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(m.doc)
	var a, b any
	_ = json.Unmarshal(before, &a)
	_ = json.Unmarshal(after, &b)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("foreign config changed: %s", after)
	}
	if err := c.Remove(context.Background(), forward); err != nil {
		t.Fatal("repeated removal was not idempotent")
	}
}

func TestConcurrentScopeChangesSurvive(t *testing.T) {
	for _, removing := range []bool{false, true} {
		t.Run(fmt.Sprint(removing), func(t *testing.T) {
			m, c := mock(t)
			f := mapping()
			if removing {
				if err := c.Install(context.Background(), f, nil); err != nil {
					t.Fatal(err)
				}
			}
			m.beforePost = func(m *mockAPI) {
				m.doc["TCP"] = json.RawMessage(`{"14567":{"HTTPS":true}}`)
				m.doc["Web"] = json.RawMessage(`{"fixture.example.ts.net:14567":{"Handlers":{"/":{"Text":"replacement"}}}}`)
				m.version++
			}
			var err error
			if removing {
				err = c.Remove(context.Background(), f)
			} else {
				err = c.Install(context.Background(), f, nil)
			}
			if err == nil {
				t.Fatal("concurrent replacement was overwritten")
			}
			raw, _ := json.Marshal(m.doc)
			if !strings.Contains(string(raw), "replacement") {
				t.Fatal("foreign replacement lost")
			}
		})
	}
}

func TestMissingETagAndFunnelFailClosed(t *testing.T) {
	m, c := mock(t)
	m.etag = false
	if err := c.Install(context.Background(), mapping(), nil); err == nil || m.posts != 0 {
		t.Fatal("mutated without conditional-write support")
	}
	m.etag = true
	m.doc["AllowFunnel"] = json.RawMessage(`{"fixture.example.ts.net:14567":true}`)
	if err := c.Install(context.Background(), mapping(), nil); err == nil || m.posts != 0 {
		t.Fatal("used a publicly enabled port")
	}
}

func TestHostReadAndReadinessDoesNotSkipTLSOrWS(t *testing.T) {
	_, c := mock(t)
	host, err := c.Host(context.Background())
	if err != nil || host != "fixture.example.ts.net" {
		t.Fatalf("host %s %v", host, err)
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			http.Error(w, "no upgrade", 400)
			return
		}
		if _, err := r.Cookie("auth"); err != nil || r.Header.Get("Authorization") != "Basic c3ludGhldGlj" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(200)
	})
	plain := httptest.NewServer(handler)
	defer plain.Close()
	cookie := &http.Cookie{Name: "auth", Value: "fixture"}
	if err = Probe(context.Background(), plain.URL, cookie, "Basic c3ludGhldGlj", "/", ""); err != nil {
		t.Fatal(err)
	}
	if err = Probe(context.Background(), plain.URL, cookie, "Basic c3ludGhldGlj", "/", "/ws"); err == nil {
		t.Fatal("HTTP success hid failed WebSocket readiness")
	}
	secure := httptest.NewTLSServer(handler)
	defer secure.Close()
	if err = Probe(context.Background(), secure.URL, cookie, "Basic c3ludGhldGlj", "/", ""); err == nil {
		t.Fatal("untrusted TLS certificate accepted")
	}
}

func TestPrivilegeApprovalAndMalformedStateDoNotMutate(t *testing.T) {
	for _, status := range []int{http.StatusForbidden, http.StatusUnauthorized} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "credential-sentinel", status) }))
			defer s.Close()
			c := &Client{Base: s.URL, HTTP: s.Client()}
			err := c.Install(context.Background(), mapping(), nil)
			if err == nil || !strings.Contains(err.Error(), "permission") || strings.Contains(err.Error(), "sentinel") {
				t.Fatalf("unsafe privilege diagnostic %v", err)
			}
		})
	}
	m, c := mock(t)
	m.doc["TCP"] = json.RawMessage(`true`)
	if err := c.Install(context.Background(), mapping(), nil); err == nil || m.posts != 0 {
		t.Fatal("malformed state became empty successful config")
	}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"BackendState":"Running","Self":{"DNSName":"fixture.example.ts.net."}}`)
	}))
	defer s.Close()
	c = &Client{Base: s.URL, HTTP: s.Client()}
	if _, err := c.Host(context.Background()); err == nil || !strings.Contains(err.Error(), "approval") {
		t.Fatal("unapproved HTTPS was not distinguished")
	}
}
