// Package tailnet manages only conditional, session-owned Tailscale Serve scopes.
package tailnet

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

type (
	Document map[string]json.RawMessage
	Client   struct {
		Base string
		HTTP *http.Client
	}
)

var errConflict = errors.New("tailscale-configuration-conflict")

func New(socket string) *Client {
	if socket == "" {
		socket = "/run/tailscale/tailscaled.sock"
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "unix", socket)
	}, ResponseHeaderTimeout: 5 * time.Second}
	return &Client{Base: "http://local-tailscaled.sock", HTTP: &http.Client{Transport: transport, Timeout: 5 * time.Second}}
}

func (c *Client) request(ctx context.Context, method, route string, body []byte, etag string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.Base+route, bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("invalid-localapi-request")
	}
	req.Header.Set("Sec-Tailscale", "localapi")
	if etag != "" {
		req.Header.Set("If-Match", etag)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		if errors.Is(err, os.ErrPermission) {
			return nil, errors.New("tailscale-permission-required")
		}
		return nil, errors.New("tailscale-localapi-unavailable")
	}
	if resp.StatusCode == 200 {
		return resp, nil
	}
	_ = resp.Body.Close()
	switch resp.StatusCode {
	case 401, 403:
		return nil, errors.New("tailscale-permission-required")
	case 412:
		return nil, errConflict
	default:
		return nil, errors.New("tailscale-localapi-failed")
	}
}

func (c *Client) read(ctx context.Context) (Document, string, error) {
	resp, err := c.request(ctx, http.MethodGet, "/localapi/v0/serve-config", nil, "")
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()
	etag := resp.Header.Get("ETag")
	if etag == "" {
		return nil, "", errors.New("tailscale-conditional-writes-unsupported")
	}
	var d Document
	if err = json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&d); err != nil {
		return nil, "", errors.New("invalid-tailscale-configuration")
	}
	if d == nil {
		d = make(Document)
	}
	return d, etag, nil
}

func (c *Client) write(ctx context.Context, d Document, etag string) error {
	data, err := json.Marshal(d)
	if err != nil {
		return errors.New("invalid-tailscale-configuration")
	}
	resp, err := c.request(ctx, http.MethodPost, "/localapi/v0/serve-config", data, etag)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}

func object(raw json.RawMessage) (Document, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return make(Document), nil
	}
	var d Document
	if err := json.Unmarshal(raw, &d); err != nil || d == nil {
		return nil, errors.New("unsupported-tailscale-configuration")
	}
	return d, nil
}
func encoded(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
func same(a, b json.RawMessage) bool {
	var x, y any
	da := json.NewDecoder(bytes.NewReader(a))
	da.UseNumber()
	db := json.NewDecoder(bytes.NewReader(b))
	db.UseNumber()
	return da.Decode(&x) == nil && db.Decode(&y) == nil && reflect.DeepEqual(x, y)
}

func occupied(d Document, port int, depth int) (bool, error) {
	if depth > 5 {
		return false, errors.New("unsupported-tailscale-configuration")
	}
	tcp, err := object(d["TCP"])
	if err != nil {
		return false, err
	}
	if _, ok := tcp[strconv.Itoa(port)]; ok {
		return true, nil
	}
	for _, field := range []string{"Web", "AllowFunnel"} {
		entries, e := object(d[field])
		if e != nil {
			return false, e
		}
		for key, raw := range entries {
			_, p, e := net.SplitHostPort(key)
			if e != nil {
				return false, errors.New("unsupported-tailscale-configuration")
			}
			if p == strconv.Itoa(port) {
				if field == "Web" {
					return true, nil
				}
				var enabled bool
				if e = json.Unmarshal(raw, &enabled); e != nil {
					return false, errors.New("unsupported-tailscale-configuration")
				}
				if enabled {
					return true, nil
				}
			}
		}
	}
	for _, field := range []string{"Foreground", "Services"} {
		entries, e := object(d[field])
		if e != nil {
			return false, e
		}
		for _, raw := range entries {
			nested, e := object(raw)
			if e != nil {
				return false, e
			}
			yes, e := occupied(nested, port, depth+1)
			if e != nil || yes {
				return yes, e
			}
		}
	}
	return false, nil
}

func (c *Client) Host(ctx context.Context) (string, error) {
	resp, err := c.request(ctx, http.MethodGet, "/localapi/v0/status?peers=false", nil, "")
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	var status struct {
		BackendState string
		Self         struct{ DNSName string }
		CertDomains  []string
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&status); err != nil {
		return "", errors.New("invalid-tailscale-status")
	}
	if status.BackendState != "Running" {
		return "", errors.New("tailscale-not-running")
	}
	host := strings.TrimSuffix(status.Self.DNSName, ".")
	if host == "" || strings.ContainsAny(host, "/:@?# \t\r\n") {
		return "", errors.New("tailscale-dns-unavailable")
	}
	for _, domain := range status.CertDomains {
		if strings.TrimSuffix(domain, ".") == host {
			return host, nil
		}
	}
	return "", errors.New("tailscale-https-approval-required")
}

func (c *Client) Reserve(ctx context.Context, target string, intent func(*state.Forward) error) (*state.Forward, error) {
	host, err := c.Host(ctx)
	if err != nil {
		return nil, err
	}
	for range 12 {
		var b [2]byte
		if _, err = rand.Read(b[:]); err != nil {
			return nil, errors.New("port-randomness-unavailable")
		}
		port := 10000 + (int(b[0])*256+int(b[1]))%50000
		f := &state.Forward{Port: port, Host: host, Target: target}
		if err = c.Install(ctx, f, intent); err == nil {
			return f, nil
		}
		if err.Error() != "tailscale-scope-occupied" {
			return f, err
		}
	}
	return nil, errors.New("tailscale-no-free-scope")
}

func (c *Client) Install(ctx context.Context, f *state.Forward, intent func(*state.Forward) error) error {
	if f.Port < 1 || f.Port > 65535 || f.Host == "" || strings.ContainsAny(f.Host, "/:@?# \t\r\n") {
		return errors.New("invalid-tailscale-scope")
	}
	if _, err := config.Target(f.Target); err != nil {
		return errors.New("invalid-tailscale-target")
	}
	f.TCP = encoded(map[string]any{"HTTPS": true})
	f.Web = encoded(map[string]any{"Handlers": map[string]any{"/": map[string]any{"Proxy": f.Target}}})
	for range 3 {
		d, etag, err := c.read(ctx)
		if err != nil {
			return err
		}
		used, err := occupied(d, f.Port, 0)
		if err != nil {
			return err
		}
		if used {
			return errors.New("tailscale-scope-occupied")
		}
		_, f.ParentTCP = d["TCP"]
		_, f.ParentWeb = d["Web"]
		if intent != nil {
			if err = intent(f); err != nil {
				return errors.New("cannot-persist-forward-ownership")
			}
		}
		tcp, _ := object(d["TCP"])
		web, _ := object(d["Web"])
		tcp[strconv.Itoa(f.Port)] = f.TCP
		web[net.JoinHostPort(f.Host, strconv.Itoa(f.Port))] = f.Web
		d["TCP"] = encoded(tcp)
		d["Web"] = encoded(web)
		if err = c.write(ctx, d, etag); errors.Is(err, errConflict) {
			continue
		} else {
			return err
		}
	}
	return errConflict
}

func (c *Client) Remove(ctx context.Context, f *state.Forward) error {
	if f == nil {
		return nil
	}
	key := net.JoinHostPort(f.Host, strconv.Itoa(f.Port))
	port := strconv.Itoa(f.Port)
	for range 3 {
		d, etag, err := c.read(ctx)
		if err != nil {
			return err
		}
		tcp, err := object(d["TCP"])
		if err != nil {
			return err
		}
		web, err := object(d["Web"])
		if err != nil {
			return err
		}
		_, hasTCP := tcp[port]
		_, hasWeb := web[key]
		if !hasTCP && !hasWeb {
			return nil
		}
		if !hasTCP || !hasWeb || !same(tcp[port], f.TCP) || !same(web[key], f.Web) {
			return errors.New("tailscale-forward-ownership-changed")
		}
		funnel, err := object(d["AllowFunnel"])
		if err != nil {
			return err
		}
		if raw, ok := funnel[key]; ok && string(raw) != "false" {
			return errors.New("tailscale-forward-ownership-changed")
		}
		delete(tcp, port)
		delete(web, key)
		if len(tcp) == 0 && !f.ParentTCP {
			delete(d, "TCP")
		} else {
			d["TCP"] = encoded(tcp)
		}
		if len(web) == 0 && !f.ParentWeb {
			delete(d, "Web")
		} else {
			d["Web"] = encoded(web)
		}
		if err = c.write(ctx, d, etag); errors.Is(err, errConflict) {
			continue
		} else {
			return err
		}
	}
	return errConflict
}

// Probe checks transport from this host; it never attests another device's reachability.
func Probe(ctx context.Context, origin string, cookie *http.Cookie, appPath, wsPath string) error {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("invalid-probe-origin")
	}
	if u.Scheme == "http" {
		ip := net.ParseIP(u.Hostname())
		if ip == nil || !ip.IsLoopback() {
			return errors.New("unencrypted-probe-origin-rejected")
		}
	}
	if appPath == "" {
		appPath = "/"
	}
	relative, err := url.Parse(appPath)
	if err != nil || relative.IsAbs() || relative.Host != "" {
		return errors.New("invalid-probe-path")
	}
	target := u.ResolveReference(relative)
	transport := &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 3 * time.Second}).DialContext, ResponseHeaderTimeout: 3 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return errors.New("invalid-probe-request")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := client.Do(req)
	if err != nil {
		return probeError(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return errors.New("authenticated-http-readiness-failed")
	}
	if wsPath != "" {
		return websocket(ctx, u, cookie, wsPath)
	}
	return nil
}

func probeError(err error) error {
	var cert *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var dns *net.DNSError
	switch {
	case errors.As(err, &cert), errors.As(err, &unknown):
		return errors.New("tls-certificate-readiness-failed")
	case errors.As(err, &dns):
		return errors.New("dns-readiness-failed")
	default:
		return errors.New("connection-readiness-failed")
	}
}

func websocket(ctx context.Context, u *url.URL, cookie *http.Cookie, route string) error {
	path, err := url.Parse(route)
	if err != nil || path.IsAbs() || path.Host != "" {
		return errors.New("invalid-websocket-path")
	}
	address := u.Host
	if u.Port() == "" {
		port := "443"
		if u.Scheme == "http" {
			port = "80"
		}
		address = net.JoinHostPort(u.Hostname(), port)
	}
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	var conn net.Conn
	if u.Scheme == "https" {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: &tls.Config{ServerName: u.Hostname(), MinVersion: tls.VersionTLS12}}).DialContext(ctx, "tcp", address)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", address)
	}
	if err != nil {
		return probeError(err)
	}
	defer func() { _ = conn.Close() }()
	deadline := time.Now().Add(5 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	_ = conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	var b [16]byte
	if _, err = rand.Read(b[:]); err != nil {
		return errors.New("websocket-randomness-unavailable")
	}
	key := base64.StdEncoding.EncodeToString(b[:])
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.ResolveReference(path).String(), nil)
	if err != nil {
		return errors.New("invalid-websocket-request")
	}
	req.Header.Set("Origin", u.String())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", key)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if err = req.Write(conn); err != nil {
		return errors.New("websocket-readiness-failed")
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), req)
	if err != nil {
		return errors.New("websocket-readiness-failed")
	}
	defer func() { _ = resp.Body.Close() }()
	want := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	if resp.StatusCode != 101 || !strings.EqualFold(resp.Header.Get("Upgrade"), "websocket") || resp.Header.Get("Sec-WebSocket-Accept") != base64.StdEncoding.EncodeToString(want[:]) {
		return fmt.Errorf("websocket-readiness-failed")
	}
	return nil
}

// Plan selects an unused dedicated scope without changing the daemon. Install
// repeats the ownership check against the ETag used for the actual mutation.
func (c *Client) Plan(ctx context.Context, target string) (*state.Forward, error) {
	host, err := c.Host(ctx)
	if err != nil {
		return nil, err
	}
	d, _, err := c.read(ctx)
	if err != nil {
		return nil, err
	}
	for range 32 {
		var b [2]byte
		if _, err = rand.Read(b[:]); err != nil {
			return nil, errors.New("port-randomness-unavailable")
		}
		port := 10000 + (int(b[0])*256+int(b[1]))%50000
		used, err := occupied(d, port, 0)
		if err != nil {
			return nil, err
		}
		if !used {
			return &state.Forward{Host: host, Port: port, Target: target}, nil
		}
	}
	return nil, errors.New("tailscale-no-free-scope")
}
