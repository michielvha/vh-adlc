package proxy

import (
	"bufio"
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func fixture(t *testing.T, upstream string) (*Proxy, *httptest.Server) {
	t.Helper()
	s := httptest.NewUnstartedServer(nil)
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "http://" + s.Listener.Addr().String(), Target: upstream, Deadline: time.Now().Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	s.Config.Handler = p
	s.Config.ConnState = p.ConnState
	s.Start()
	t.Cleanup(func() { p.Revoke(); s.Close() })
	return p, s
}

func enroll(t *testing.T, p *Proxy, s *httptest.Server) *http.Cookie {
	t.Helper()
	code, err := p.Issue()
	if err != nil {
		t.Fatal(err)
	}
	r := redeem(t, s, code)
	defer func() { _ = r.Body.Close() }()
	if r.StatusCode != http.StatusSeeOther {
		t.Fatalf("enroll status %d", r.StatusCode)
	}
	cs := r.Cookies()
	if len(cs) != 1 {
		t.Fatalf("auth cookie count %d", len(cs))
	}
	return cs[0]
}

func redeem(t *testing.T, s *httptest.Server, code string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, s.URL+"/__remote_gui/login", strings.NewReader(url.Values{"code": {code}}.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", s.URL)
	c := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func get(t *testing.T, s *httptest.Server, path string, cookies ...*http.Cookie) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, s.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestAuthAndUpstreamCookieBoundary(t *testing.T) {
	var seen atomic.Value
	seen.Store("")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.Store(r.Header.Get("Cookie"))
		if r.URL.Path == "/set" {
			http.SetCookie(w, &http.Cookie{Name: "app", Value: "app-only", Path: "/", HttpOnly: true})
		}
		if r.URL.Path == "/malicious" {
			http.SetCookie(w, &http.Cookie{Name: "__remote_gui_other", Value: "overwrite", Path: "/"})
		}
		_, _ = io.WriteString(w, "application")
	}))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	r := get(t, s, "/")
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("unauthenticated app was served")
	}
	cookie := enroll(t, p, s)
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("weak authentication cookie")
	}
	r = get(t, s, "/set", cookie, &http.Cookie{Name: "foreign", Value: "not-for-upstream"})
	_ = r.Body.Close()
	if len(r.Header.Values("Set-Cookie")) != 0 || seen.Load().(string) != "" {
		t.Fatal("browser cookie or upstream Set-Cookie crossed proxy boundary")
	}
	r = get(t, s, "/echo", cookie)
	_ = r.Body.Close()
	if seen.Load().(string) != "app=app-only" {
		t.Fatalf("server cookie failed: %q", seen.Load())
	}
	second := enroll(t, p, s)
	r = get(t, s, "/echo", second, cookie)
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("ambiguous proxy cookies accepted")
	}
	r = get(t, s, "/echo", second)
	_ = r.Body.Close()
	if seen.Load().(string) != "" {
		t.Fatal("app cookies leaked between clients")
	}
	r = get(t, s, "/malicious", second)
	_ = r.Body.Close()
	if r.StatusCode != 502 || len(r.Header.Values("Set-Cookie")) != 0 {
		t.Fatal("upstream replaced proxy authentication")
	}
	p2, s2 := fixture(t, upstream.URL)
	_ = enroll(t, p2, s2)
	r = get(t, s2, "/", cookie)
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("cross-session cookie authenticated")
	}
	p.Revoke()
	r = get(t, s, "/", second)
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("revoked authentication survived")
	}
}

func TestOneTimeEnrollmentAndExpiry(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	old, _ := p.Issue()
	fresh, _ := p.Issue()
	r := redeem(t, s, old)
	_ = r.Body.Close()
	if r.StatusCode == 303 {
		t.Fatal("old unredeemed code survived replacement")
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			resp := redeem(t, s, fresh)
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode == 303 {
				successes.Add(1)
			}
		})
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatalf("one code redeemed %d times", successes.Load())
	}
	p.mu.Lock()
	p.deadline = time.Now().Add(-time.Second)
	p.mu.Unlock()
	if _, err := p.Issue(); err == nil {
		t.Fatal("issued code for expired session")
	}
}

func TestCrossOriginAndHostRejected(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	cookie := enroll(t, p, s)
	for _, origin := range []string{"http://foreign.invalid", "null"} {
		req, _ := http.NewRequest(http.MethodGet, s.URL+"/", nil)
		req.Header.Set("Origin", origin)
		req.AddCookie(cookie)
		r, err := s.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = r.Body.Close()
		if r.StatusCode == 200 {
			t.Fatal("cross-origin request accepted")
		}
	}
	req, _ := http.NewRequest(http.MethodGet, s.URL+"/", nil)
	req.Host = "foreign.invalid"
	req.AddCookie(cookie)
	r, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("foreign Host accepted")
	}
}

func TestAuthenticatedWebSocketAndRevocation(t *testing.T) {
	var seen atomic.Value
	seen.Store("")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.Store(r.Header.Get("Cookie"))
		c, rw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer func() { _ = c.Close() }()
		hash := sha1.Sum([]byte(r.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		_, _ = fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", base64.StdEncoding.EncodeToString(hash[:]))
		_ = rw.Flush()
		line, err := rw.ReadString('\n')
		if err == nil {
			_, _ = io.WriteString(rw, line)
			_ = rw.Flush()
		}
		_, _ = io.Copy(io.Discard, rw)
	}))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	cookie := enroll(t, p, s)
	c, err := net.DialTimeout("tcp", s.Listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(2 * time.Second))
	_, _ = fmt.Fprintf(c, "GET /socket HTTP/1.1\r\nHost: %s\r\nOrigin: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nCookie: %s=%s; foreign=sentinel\r\n\r\n", s.Listener.Addr(), s.URL, cookie.Name, cookie.Value)
	reader := bufio.NewReader(c)
	resp, err := http.ReadResponse(reader, nil)
	if err != nil || resp.StatusCode != 101 {
		t.Fatalf("upgrade %v %v", resp, err)
	}
	if seen.Load().(string) != "" {
		t.Fatal("WebSocket leaked proxy credentials")
	}
	_, _ = io.WriteString(c, "harmless\n")
	line, err := reader.ReadString('\n')
	if err != nil || line != "harmless\n" {
		t.Fatalf("WebSocket bridge %q %v", line, err)
	}
	p.Revoke()
	if _, err = reader.ReadByte(); err == nil {
		t.Fatal("revocation left upgraded connection open")
	}
}

func TestCodeDeadlineAndRateLimit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	code, _ := p.Issue()
	p.mu.Lock()
	p.codeExpiry = time.Now().Add(-time.Second)
	p.mu.Unlock()
	r := redeem(t, s, code)
	_ = r.Body.Close()
	if r.StatusCode != 401 {
		t.Fatal("expired enrollment accepted")
	}
	_, _ = p.Issue()
	for range 8 {
		r = redeem(t, s, "wrong")
		_ = r.Body.Close()
	}
	if r.StatusCode != http.StatusTooManyRequests {
		t.Fatal("login guesses were not bounded")
	}
}

func TestLandingPathAndCookieScope(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bad-scope" {
			http.SetCookie(w, &http.Cookie{Name: "app", Value: "x", Domain: "foreign.invalid", Path: "/"})
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL+"/nested?filter=selected")
	code, _ := p.Issue()
	r := redeem(t, s, code)
	cookie := r.Cookies()[0]
	_ = r.Body.Close()
	if r.Header.Get("Location") != "/nested?filter=selected" {
		t.Fatalf("landing path lost: %s", r.Header.Get("Location"))
	}
	r = get(t, s, "/bad-scope", cookie)
	_ = r.Body.Close()
	if r.StatusCode != 502 || r.Header.Get("Set-Cookie") != "" {
		t.Fatal("foreign cookie scope crossed boundary")
	}
	req, _ := http.NewRequest(http.MethodGet, s.URL+"/socket", nil)
	req.AddCookie(cookie)
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	r, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal("WebSocket without its origin accepted")
	}
}

func TestUnsafeLocalRedirectDoesNotEscapeShare(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "//127.0.0.1:1/private")
		w.WriteHeader(http.StatusFound)
	}))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	cookie := enroll(t, p, s)
	req, _ := http.NewRequest(http.MethodGet, s.URL+"/", nil)
	req.AddCookie(cookie)
	c := &http.Client{Timeout: time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = r.Body.Close() }()
	if r.StatusCode != 502 || r.Header.Get("Location") != "" {
		t.Fatal("unshared loopback redirect escaped proxy")
	}
}

func TestViewerCredentialsAndAssetsStayBehindAuthentication(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("viewer assets or credentials reached bridge upstream")
		w.WriteHeader(500)
	}))
	defer upstream.Close()
	assets := t.TempDir()
	if err := os.Mkdir(filepath.Join(assets, "core"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assets, "core", "rfb.js"), []byte("export default class RFB {}"), 0o600); err != nil {
		t.Fatal(err)
	}
	foreign := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(foreign, []byte("private-sentinel"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(foreign, filepath.Join(assets, "core", "escape")); err != nil {
		t.Fatal(err)
	}
	s := httptest.NewUnstartedServer(nil)
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "http://" + s.Listener.Addr().String(), Target: upstream.URL, Deadline: time.Now().Add(time.Hour), ViewerAssets: assets, ViewerPassword: "synthetic-vnc-password"})
	if err != nil {
		t.Fatal(err)
	}
	s.Config.Handler = p
	s.Config.ConnState = p.ConnState
	s.Start()
	defer s.Close()
	defer p.Revoke()
	r := get(t, s, "/__remote_gui/viewer-access")
	_ = r.Body.Close()
	if r.StatusCode == 200 {
		t.Fatal("unauthenticated VNC credential retrieval")
	}
	cookie := enroll(t, p, s)
	r = get(t, s, "/vnc.html", cookie)
	page, _ := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if r.StatusCode != 200 || bytes.Contains(page, []byte("synthetic-vnc-password")) {
		t.Fatal("viewer embedded a credential or failed to render")
	}
	r = get(t, s, "/__remote_gui/viewer-access", cookie)
	data, _ := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if r.StatusCode != 200 || !bytes.Contains(data, []byte("synthetic-vnc-password")) {
		t.Fatal("authenticated viewer credential flow failed")
	}
	for route, want := range map[string]int{"/core/rfb.js": 200, "/core/": 404, "/core/escape": 404, "/utils/novnc_proxy": 404} {
		r = get(t, s, route, cookie)
		body, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		if r.StatusCode != want || bytes.Contains(body, []byte("private-sentinel")) {
			t.Fatalf("viewer asset boundary %s: %d", route, r.StatusCode)
		}
	}
}
