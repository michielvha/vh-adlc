package session

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// This fixture uses a private Unix LocalAPI and a trusted disposable HTTPS
// reverse proxy. It never contacts tailscaled or changes host Serve mappings.
func fakeTailnet(t *testing.T, home string) *atomic.Bool {
	t.Helper()
	var deny atomic.Bool
	var mu sync.Mutex
	doc := map[string]json.RawMessage{"future": json.RawMessage(`{"sentinel":12345678901234567890}`)}
	version := 1
	var exposed *http.Server
	bootstrap := httptest.NewTLSServer(http.NotFoundHandler())
	cert := bootstrap.TLS.Certificates[0]
	rawCert := bootstrap.Certificate().Raw
	bootstrap.Close()
	authority := filepath.Join(filepath.Dir(home), "authority.pem")
	if err := os.WriteFile(authority, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rawCert}), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SSL_CERT_FILE", authority)
	socket := filepath.Join(filepath.Dir(home), "localapi.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTE_GUI_TAILSCALE_SOCKET", socket)
	api := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path == "/localapi/v0/status" {
			_, _ = io.WriteString(w, `{"BackendState":"Running","Self":{"DNSName":"127.0.0.1","UserID":7},"User":{"7":{"LoginName":"owner@example.test"}},"CertDomains":["127.0.0.1"]}`)
			return
		}
		if r.URL.Path != "/localapi/v0/serve-config" {
			w.WriteHeader(404)
			return
		}
		if r.Method == http.MethodGet {
			w.Header().Set("ETag", fmt.Sprintf(`"%d"`, version))
			_ = json.NewEncoder(w).Encode(doc)
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		if r.Header.Get("If-Match") != fmt.Sprintf(`"%d"`, version) {
			w.WriteHeader(412)
			return
		}
		var next map[string]json.RawMessage
		if json.NewDecoder(r.Body).Decode(&next) != nil {
			w.WriteHeader(400)
			return
		}
		if string(next["future"]) != string(doc["future"]) {
			w.WriteHeader(400)
			return
		}
		var tcp map[string]json.RawMessage
		_ = json.Unmarshal(next["TCP"], &tcp)
		if len(tcp) == 0 {
			if deny.Load() {
				w.WriteHeader(403)
				return
			}
			if exposed != nil {
				_ = exposed.Close()
				exposed = nil
			}
		} else if exposed == nil {
			var web map[string]struct {
				Handlers map[string]struct{ Proxy string }
			}
			if json.Unmarshal(next["Web"], &web) != nil {
				w.WriteHeader(400)
				return
			}
			var port, target string
			for key := range tcp {
				port = key
			}
			for _, value := range web {
				target = value.Handlers["/"].Proxy
			}
			socketTarget, unixTarget := strings.CutPrefix(target, "unix:")
			if unixTarget {
				target = "http://localhost"
			}
			selected, err := url.Parse(target)
			if err != nil || selected.Host == "" {
				w.WriteHeader(400)
				return
			}
			bound, err := net.Listen("tcp", "127.0.0.1:"+port)
			if err != nil {
				w.WriteHeader(503)
				return
			}
			reverse := httputil.NewSingleHostReverseProxy(selected)
			if unixTarget {
				reverse.Transport = &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					return (&net.Dialer{}).DialContext(ctx, "unix", socketTarget)
				}}
				reverse = &httputil.ReverseProxy{Transport: reverse.Transport, Rewrite: func(request *httputil.ProxyRequest) {
					request.SetURL(selected)
					request.Out.Host = "localhost"
					request.Out.Header.Set("X-Forwarded-Host", request.In.Host)
					request.Out.Header.Set("X-Forwarded-Proto", "https")
					request.Out.Header.Set("Tailscale-User-Login", "owner@example.test")
				}}
			}
			exposed = &http.Server{Handler: reverse, ReadHeaderTimeout: time.Second}
			server := exposed
			secured := tls.NewListener(bound, &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12})
			go func() { _ = server.Serve(secured) }()
		}
		doc = next
		version++
		w.WriteHeader(200)
	})}
	go func() { _ = api.Serve(listener) }()
	t.Cleanup(func() {
		deny.Store(false)
		_ = api.Close()
		mu.Lock()
		defer mu.Unlock()
		if exposed != nil {
			_ = exposed.Close()
		}
	})
	return &deny
}

func TestFailedForwardRemovalKeepsDeniedPortReserved(t *testing.T) {
	for _, role := range []string{"supervisor", "guard"} {
		t.Run(role, func(t *testing.T) {
			home := root(t)
			deny := fakeTailnet(t, home)
			app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "preserved-app") }))
			defer app.Close()
			c := options(t, home, app.URL, "1m")
			c.Transport = "tailscale"
			v, err := Start(c)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { deny.Store(false); _, _ = Stop(home, v.ID) }()
			r, err := state.Load(home, v.ID)
			if err != nil {
				t.Fatal(err)
			}
			deny.Store(true)
			killed := r.Supervisor
			if role == "guard" {
				killed = r.Guard
			}
			if err = state.Signal(killed, syscall.SIGKILL); err != nil {
				t.Fatal(err)
			}
			end := waitEnd(t, home, v.ID)
			if end.State != "cleanup-pending" {
				t.Fatal("failed removal was reported cleaned")
			}
			transport := &http.Transport{Proxy: nil}
			if r.ProxyNetwork == "unix" {
				transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
					return (&net.Dialer{}).DialContext(ctx, "unix", r.ProxyAddress)
				}
			}
			client := &http.Client{Transport: transport, Timeout: time.Second}
			defer client.Transport.(*http.Transport).CloseIdleConnections()
			deadline := time.Now().Add(3 * time.Second)
			denied := false
			for time.Now().Before(deadline) {
				address := "http://" + r.ProxyAddress + "/"
				if r.ProxyNetwork == "unix" {
					address = "http://localhost/"
				}
				request, _ := http.NewRequest(http.MethodGet, address, nil)
				origin, _ := url.Parse(v.URL)
				request.Host = origin.Host
				if r.ProxyNetwork == "unix" {
					request.Host = "localhost"
					request.Header.Set("X-Forwarded-Host", origin.Host)
					request.Header.Set("X-Forwarded-Proto", "https")
				}
				response, e := client.Do(request)
				if e == nil {
					_ = response.Body.Close()
					if response.StatusCode == http.StatusGone {
						denied = true
						break
					}
				}
				time.Sleep(25 * time.Millisecond)
			}
			if !denied {
				t.Fatal("cleanup-pending listener did not deny access")
			}
			network := "tcp"
			if r.ProxyNetwork == "unix" {
				network = "unix"
			}
			listener, e := net.Listen(network, r.ProxyAddress)
			if e == nil {
				_ = listener.Close()
				t.Fatal("stale forward target became reusable")
			}
			current, err := state.Load(home, v.ID)
			if err != nil || current.Forward == nil {
				t.Fatal("failed forward intent was lost")
			}
			deny.Store(false)
			_, err = Cleanup(context.Background(), home)
			if err != nil {
				t.Fatal(err)
			}
			deadline = time.Now().Add(5 * time.Second)
			for time.Now().Before(deadline) {
				current, _ = state.Load(home, v.ID)
				if current.Forward == nil && (current.State == "failed" || current.State == "stopped") {
					break
				}
				time.Sleep(25 * time.Millisecond)
			}
			if current.Forward != nil {
				t.Fatal("conditional removal did not recover")
			}
			response, err := app.Client().Get(app.URL)
			if err != nil {
				t.Fatal("cleanup stopped upstream app")
			}
			_ = response.Body.Close()
		})
	}
}
