package proxy

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
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

type testCredential struct {
	*http.Cookie
	Code string
}

func (c *testCredential) apply(r *http.Request) {
	r.AddCookie(c.Cookie)
	if c.Code != "" {
		r.SetBasicAuth("viewer", c.Code)
	}
}

func enroll(t *testing.T, p *Proxy, s *httptest.Server) *testCredential {
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
	return &testCredential{Cookie: cs[0], Code: code}
}

func redeem(t *testing.T, s *httptest.Server, code string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, s.URL+"/?__remote_gui_enroll=1", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.SetBasicAuth("viewer", code)
	req.Header.Set("Origin", s.URL)
	c := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func get(t *testing.T, s *httptest.Server, path string, cookies ...*testCredential) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, s.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cookies {
		c.apply(req)
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
	r = get(t, s, "/set", cookie, &testCredential{Cookie: &http.Cookie{Name: "foreign", Value: "not-for-upstream"}})
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
		cookie.apply(req)
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
	cookie.apply(req)
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
	_, _ = fmt.Fprintf(c, "GET /socket HTTP/1.1\r\nHost: %s\r\nOrigin: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Basic %s\r\nCookie: %s=%s; foreign=sentinel\r\n\r\n", s.Listener.Addr(), s.URL, base64.StdEncoding.EncodeToString([]byte("viewer:"+cookie.Code)), cookie.Name, cookie.Value)
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
	cookie := &testCredential{Cookie: r.Cookies()[0], Code: code}
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
	cookie.apply(req)
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
	cookie.apply(req)
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

func TestEnrollmentPagePreservesSameOriginFormOrigin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	_, server := fixture(t, upstream.URL)
	for _, route := range []string{"/", "/__remote_gui/login"} {
		response := get(t, server, route)
		_ = response.Body.Close()
		if response.Header.Get("Referrer-Policy") != "same-origin" {
			t.Fatal("enrollment form policy causes browser Origin:null")
		}
	}
}

func TestSecureAppCookiesWorkThroughHTTPSOrigin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/set" {
			http.SetCookie(w, &http.Cookie{Name: "app-session", Value: "synthetic-app", Path: "/", HttpOnly: true, Secure: true})
			return
		}
		cookie, err := r.Cookie("app-session")
		if err != nil || cookie.Value != "synthetic-app" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	server := httptest.NewUnstartedServer(nil)
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "https://" + server.Listener.Addr().String(), Target: upstream.URL, Deadline: time.Now().Add(time.Minute)})
	if err != nil {
		t.Fatal(err)
	}
	server.Config.Handler = p
	server.Config.ConnState = p.ConnState
	server.StartTLS()
	defer server.Close()
	defer p.Revoke()
	grant, err := p.ProbeGrant()
	if err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{"/set", "/read"} {
		request, _ := http.NewRequest(http.MethodGet, server.URL+route, nil)
		request.AddCookie(grant.Cookie)
		request.Header.Set("Authorization", grant.Authorization)
		response, err := server.Client().Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != 200 {
			t.Fatal("Secure app cookie was dropped behind the HTTPS share")
		}
		if len(response.Cookies()) != 0 {
			t.Fatal("app cookie reached the browser")
		}
	}
}

const clipboardSentinel = "clipboard-sentinel-Zürich-€-✓"

type fakeClipboard struct {
	mu       sync.Mutex
	calls    int
	mode     string
	setErr   error
	sets     []string
	expected []string
	clears   int
}

func (f *fakeClipboard) Set(_ context.Context, text, expectedMode string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.setErr != nil {
		return f.mode, f.setErr
	}
	f.sets, f.expected = append(f.sets, text), append(f.expected, expectedMode)
	return f.mode, nil
}

func (f *fakeClipboard) Get(context.Context) (string, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return clipboardSentinel, f.mode, nil
}

func (f *fakeClipboard) Clear(context.Context) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.clears++
	return f.mode, nil
}

func (f *fakeClipboard) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func viewerAssets(t *testing.T) string {
	t.Helper()
	assets := t.TempDir()
	if err := os.Mkdir(filepath.Join(assets, "core"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assets, "core", "rfb.js"), []byte("export default class RFB {}"), 0o600); err != nil {
		t.Fatal(err)
	}
	return assets
}

func clipboardFixture(t *testing.T, clip Clipboard) (*Proxy, *httptest.Server) {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	t.Cleanup(upstream.Close)
	s := httptest.NewUnstartedServer(nil)
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "http://" + s.Listener.Addr().String(), Target: upstream.URL, Deadline: time.Now().Add(time.Hour), ViewerAssets: viewerAssets(t), ViewerPassword: "synthetic-vnc-password", Clipboard: clip})
	if err != nil {
		t.Fatal(err)
	}
	s.Config.Handler = p
	s.Config.ConnState = p.ConnState
	s.Start()
	t.Cleanup(func() { p.Revoke(); s.Close() })
	return p, s
}

type clipboardCall struct {
	method, query, body, contentType string
	headers                          map[string]string
}

func callClipboard(t *testing.T, s *httptest.Server, call clipboardCall, credential *testCredential) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(call.method, s.URL+"/__remote_gui/clipboard"+call.query, strings.NewReader(call.body))
	if err != nil {
		t.Fatal(err)
	}
	if call.contentType != "" {
		req.Header.Set("Content-Type", call.contentType)
	}
	for key, value := range call.headers {
		req.Header.Set(key, value)
	}
	if credential != nil {
		credential.apply(req)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	return resp, string(body)
}

func TestClipboardRoutesRefuseUnsafeRequests(t *testing.T) {
	clip := &fakeClipboard{mode: "human"}
	p, s := clipboardFixture(t, clip)
	same := map[string]string{"X-Remote-GUI-Clipboard": "1", "Sec-Fetch-Site": "same-origin", "Origin": s.URL}
	with := func(changes map[string]string) map[string]string {
		out := map[string]string{}
		for k, v := range same {
			out[k] = v
		}
		for k, v := range changes {
			if v == "" {
				delete(out, k)
			} else {
				out[k] = v
			}
		}
		return out
	}
	methods := []clipboardCall{
		{method: http.MethodGet},
		{method: http.MethodPost, query: "?expected_mode=human", body: "refused-send", contentType: "text/plain; charset=utf-8"},
		{method: http.MethodDelete},
	}
	for _, call := range methods {
		call.headers = same
		resp, body := callClipboard(t, s, call, nil)
		if resp.StatusCode == 200 || strings.Contains(body, clipboardSentinel) {
			t.Fatalf("unauthenticated %s: %d", call.method, resp.StatusCode)
		}
	}
	credential := enroll(t, p, s)
	refusals := map[string]map[string]string{
		"foreign origin":   with(map[string]string{"Origin": "http://attacker.test"}),
		"cross-site fetch": with(map[string]string{"Sec-Fetch-Site": "cross-site"}),
		"same-site fetch":  with(map[string]string{"Sec-Fetch-Site": "same-site"}),
		"missing header":   with(map[string]string{"X-Remote-GUI-Clipboard": ""}),
	}
	for name, headers := range refusals {
		for _, call := range methods {
			call.headers = headers
			resp, body := callClipboard(t, s, call, credential)
			if resp.StatusCode == 200 || strings.Contains(body, clipboardSentinel) || resp.Header.Get("Access-Control-Allow-Origin") != "" {
				t.Fatalf("%s %s accepted: %d", name, call.method, resp.StatusCode)
			}
		}
	}
	resp, body := callClipboard(t, s, clipboardCall{method: http.MethodPut, headers: same}, credential)
	if resp.StatusCode != http.StatusMethodNotAllowed || strings.Contains(body, clipboardSentinel) {
		t.Fatalf("wrong method: %d", resp.StatusCode)
	}
	if clip.count() != 0 {
		t.Fatalf("refused requests reached the clipboard %d times", clip.count())
	}
}

func TestClipboardRoutesServeTheOwner(t *testing.T) {
	clip := &fakeClipboard{mode: "agent"}
	p, s := clipboardFixture(t, clip)
	credential := enroll(t, p, s)
	// Browsers send no Origin on a same-origin GET fetch.
	resp, body := callClipboard(t, s, clipboardCall{method: http.MethodGet, headers: map[string]string{"X-Remote-GUI-Clipboard": "1", "Sec-Fetch-Site": "same-origin"}}, credential)
	var got struct {
		Text        string `json:"text"`
		BrowserMode string `json:"browser_mode"`
	}
	if resp.StatusCode != 200 || json.Unmarshal([]byte(body), &got) != nil || got.Text != clipboardSentinel || got.BrowserMode != "agent" {
		t.Fatalf("same-origin read: %d %s", resp.StatusCode, body)
	}
	for _, header := range []string{"Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Credentials"} {
		if resp.Header.Get(header) != "" {
			t.Fatalf("clipboard route sent %s", header)
		}
	}
	if resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("clipboard read is cacheable")
	}
	headers := map[string]string{"X-Remote-GUI-Clipboard": "1", "Sec-Fetch-Site": "same-origin", "Origin": s.URL}
	text := strings.Repeat("é", MaxClipboardText/2)
	resp, body = callClipboard(t, s, clipboardCall{method: http.MethodPost, query: "?expected_mode=agent", body: text, contentType: "text/plain;charset=UTF-8", headers: headers}, credential)
	if resp.StatusCode != 200 || !strings.Contains(body, `"browser_mode":"agent"`) || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("64 KiB send: %d %s", resp.StatusCode, body)
	}
	clip.mu.Lock()
	sent := len(clip.sets) == 1 && clip.sets[0] == text && clip.expected[0] == "agent"
	clip.mu.Unlock()
	if !sent {
		t.Fatal("send did not reach the clipboard with its expected mode")
	}
	resp, body = callClipboard(t, s, clipboardCall{method: http.MethodPost, query: "?expected_mode=agent", body: text + "x", contentType: "text/plain", headers: headers}, credential)
	if resp.StatusCode != http.StatusRequestEntityTooLarge || !strings.Contains(body, "clipboard-too-large") {
		t.Fatalf("oversized send: %d %s", resp.StatusCode, body)
	}
	for name, call := range map[string]clipboardCall{
		"invalid mode":  {method: http.MethodPost, query: "?expected_mode=robot", body: "x", contentType: "text/plain"},
		"invalid utf-8": {method: http.MethodPost, query: "?expected_mode=agent", body: "\xff", contentType: "text/plain"},
		"not text":      {method: http.MethodPost, query: "?expected_mode=agent", body: "x", contentType: "application/json"},
	} {
		call.headers = headers
		if resp, _ = callClipboard(t, s, call, credential); resp.StatusCode < 400 || resp.StatusCode >= 500 {
			t.Fatalf("%s: %d", name, resp.StatusCode)
		}
	}
	clip.mu.Lock()
	sends := len(clip.sets)
	clip.setErr = errors.New("clipboard-busy")
	clip.mu.Unlock()
	if sends != 1 {
		t.Fatal("refused send reached the clipboard")
	}
	resp, body = callClipboard(t, s, clipboardCall{method: http.MethodPost, query: "?expected_mode=human", body: "busy-send", contentType: "text/plain", headers: headers}, credential)
	if resp.StatusCode != http.StatusConflict || !strings.Contains(body, `"error":"clipboard-busy"`) || !strings.Contains(body, `"browser_mode":"agent"`) || strings.Contains(body, "busy-send") {
		t.Fatalf("busy send: %d %s", resp.StatusCode, body)
	}
	resp, body = callClipboard(t, s, clipboardCall{method: http.MethodDelete, headers: headers}, credential)
	if resp.StatusCode != 200 || !strings.Contains(body, `"browser_mode":"agent"`) || clip.clears != 1 {
		t.Fatalf("clear: %d %s", resp.StatusCode, body)
	}
}

func TestClipboardRouteAbsentWithoutClipboard(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, s := fixture(t, upstream.URL)
	credential := enroll(t, p, s)
	resp, _ := callClipboard(t, s, clipboardCall{method: http.MethodGet, headers: map[string]string{"X-Remote-GUI-Clipboard": "1"}}, credential)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("service share exposed a clipboard route: %d", resp.StatusCode)
	}
}

func TestClipboardRouteNeedsOwnerIdentity(t *testing.T) {
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer app.Close()
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
	clip := &fakeClipboard{mode: "human"}
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "https://owner.test:12000", Target: app.URL, Deadline: time.Now().Add(time.Minute), OwnerLogin: "owner@example.test", ServePeer: peer, ViewerAssets: viewerAssets(t), ViewerPassword: "synthetic-vnc-password", Clipboard: clip})
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
	for _, owner := range []string{"", "someone-else@example.test"} {
		r, _ := http.NewRequest(http.MethodGet, "http://localhost/__remote_gui/clipboard", nil)
		r.Header.Set("X-Forwarded-Host", "owner.test:12000")
		r.Header.Set("X-Forwarded-Proto", "https")
		r.Header.Set("X-Remote-GUI-Clipboard", "1")
		r.Header.Set("Sec-Fetch-Site", "same-origin")
		if owner != "" {
			r.Header.Set("Tailscale-User-Login", owner)
		}
		response, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		body, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if response.StatusCode == 200 || strings.Contains(string(body), clipboardSentinel) {
			t.Fatalf("clipboard read without the owner's identity %q: %d", owner, response.StatusCode)
		}
	}
	r, _ := http.NewRequest(http.MethodGet, "http://localhost/__remote_gui/clipboard", nil)
	r.Header.Set("X-Forwarded-Host", "owner.test:12000")
	r.Header.Set("X-Forwarded-Proto", "https")
	r.Header.Set("X-Remote-GUI-Clipboard", "1")
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("Tailscale-User-Login", "owner@example.test")
	response, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != 200 || !strings.Contains(string(body), clipboardSentinel) {
		t.Fatalf("owner clipboard read: %d", response.StatusCode)
	}
	if clip.count() != 1 {
		t.Fatalf("refused identity requests reached the clipboard: %d calls", clip.count())
	}
}
