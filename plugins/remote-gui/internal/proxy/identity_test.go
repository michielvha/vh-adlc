package proxy

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func TestPasswordlessIdentityRequiresVerifiedUnixIngress(t *testing.T) {
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			conn, rw, e := w.(http.Hijacker).Hijack()
			if e != nil {
				return
			}
			defer func() { _ = conn.Close() }()
			hash := sha1.Sum([]byte(r.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
			_, _ = fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", base64.StdEncoding.EncodeToString(hash[:]))
			_ = rw.Flush()
			_, _ = io.Copy(io.Discard, rw)
			return
		}
		for key := range r.Header {
			if strings.HasPrefix(strings.ToLower(key), "tailscale-") {
				t.Error("identity leaked upstream")
			}
		}
		if r.URL.Path == "/set" {
			http.SetCookie(w, &http.Cookie{Name: "app", Value: "only-this-client", Path: "/", HttpOnly: true})
		}
		_, _ = io.WriteString(w, "app:"+r.Header.Get("Cookie"))
	}))
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
	p, err := New(Options{ID: "0123456789abcdef0123456789abcdef", Origin: "https://owner.test:12000", Target: app.URL, Deadline: time.Now().Add(time.Minute), OwnerLogin: "owner@example.test", ServePeer: peer})
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
	request := func(path, owner, site, mode, dest string, cookie *http.Cookie, extra ...http.Header) (int, string, *http.Cookie) {
		t.Helper()
		r, _ := http.NewRequest(http.MethodGet, "http://localhost"+path, nil)
		r.Header.Set("X-Forwarded-Host", "owner.test:12000")
		r.Header.Set("X-Forwarded-Proto", "https")
		if owner != "" {
			r.Header.Set("Tailscale-User-Login", owner)
		}
		r.Header.Set("Sec-Fetch-Site", site)
		r.Header.Set("Sec-Fetch-Mode", mode)
		r.Header.Set("Sec-Fetch-Dest", dest)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		for _, headers := range extra {
			for key, values := range headers {
				r.Header[key] = values
			}
		}
		response, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		defer func() { _ = response.Body.Close() }()
		body, _ := io.ReadAll(response.Body)
		if response.Header.Get("WWW-Authenticate") != "" {
			t.Fatal("passwordless identity issued a native auth challenge")
		}
		var binding *http.Cookie
		for _, c := range response.Cookies() {
			if strings.HasPrefix(c.Name, CookiePrefix) {
				binding = c
			}
		}
		return response.StatusCode, string(body), binding
	}
	code, _, binding := request("/set", "owner@example.test", "cross-site", "navigate", "document", nil)
	if code != 200 || binding == nil {
		t.Fatal("owner could not open intended page directly")
	}
	code, body, _ := request("/read", "owner@example.test", "same-origin", "cors", "empty", binding)
	if code != 200 || body != "app:app=only-this-client" {
		t.Fatal("owner app cookie jar failed")
	}
	for _, owner := range []string{"", "other@example.test", "owner@example.test,other@example.test"} {
		code, _, _ = request("/read", owner, "same-origin", "cors", "empty", binding)
		if code != 403 {
			t.Fatal("missing/different/ambiguous identity was authorized")
		}
	}
	code, _, _ = request("/read", "owner@example.test", "same-site", "no-cors", "image", binding)
	if code != 403 {
		t.Fatal("cross-port ambient request was authorized")
	}
	code, _, _ = request("/read", "owner@example.test", "cross-site", "no-cors", "image", binding)
	if code != 403 {
		t.Fatal("cross-site ambient request was authorized")
	}
	for _, headers := range []http.Header{
		{"Tailscale-User-Login": {"owner@example.test", "owner@example.test"}},
		{"X-Forwarded-Host": {"owner.test:12000", "owner.test:12000"}},
		{"X-Forwarded-Proto": {"http"}},
		{"Tailscale-Funnel-Request": {"?1"}},
		{"Origin": {"https://other.test"}},
	} {
		code, _, _ = request("/read", "owner@example.test", "same-origin", "cors", "empty", binding, headers)
		if code != 403 {
			t.Fatal("ambiguous/foreign ingress accepted")
		}
	}
	executable, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	attack := exec.Command(executable, "-test.run=^TestUntrustedUnixPeerHelper$")
	attack.Env = append(os.Environ(), "REMOTE_GUI_PEER_ATTACK_SOCKET="+socket)
	if out, e := attack.CombinedOutput(); e != nil {
		t.Fatalf("local forged-header test: %v %s", e, out)
	}
	ws, err := net.Dial("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ws.Close() }()
	_ = ws.SetDeadline(time.Now().Add(2 * time.Second))
	_, _ = fmt.Fprintf(ws, "GET /ws HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-Host: owner.test:12000\r\nX-Forwarded-Proto: https\r\nTailscale-User-Login: owner@example.test\r\nOrigin: https://owner.test:12000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")
	wsReader := bufio.NewReader(ws)
	upgrade, err := http.ReadResponse(wsReader, nil)
	if err != nil || upgrade.StatusCode != 101 {
		t.Fatal("passwordless owner WebSocket rejected")
	}
	tcp := httptest.NewServer(p)
	defer tcp.Close()
	r, _ := http.NewRequest(http.MethodGet, tcp.URL+"/read", nil)
	r.Host = "owner.test:12000"
	r.Header.Set("Tailscale-User-Login", "owner@example.test")
	r.AddCookie(binding)
	response, err := tcp.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("forged TCP identity/cookie authorized")
	}
	if _, err = p.Issue(); err == nil {
		t.Fatal("Tailscale mode issued a user enrollment code")
	}
	p.Revoke()
	if _, e := wsReader.ReadByte(); e == nil {
		t.Fatal("revocation left owner WebSocket open")
	}
	code, _, _ = request("/read", "owner@example.test", "same-origin", "cors", "empty", binding)
	if code != 410 {
		t.Fatal("revoked identity remained usable")
	}
}

func TestUntrustedUnixPeerHelper(t *testing.T) {
	socket := os.Getenv("REMOTE_GUI_PEER_ATTACK_SOCKET")
	if socket == "" {
		return
	}
	conn, err := net.Dial("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(time.Second))
	_, _ = io.WriteString(conn, "GET /read HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-Host: owner.test:12000\r\nX-Forwarded-Proto: https\r\nTailscale-User-Login: owner@example.test\r\n\r\n")
	response, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("another local process impersonated the daemon")
	}
}
