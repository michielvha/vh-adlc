// Package proxy provides session-bound enrollment and isolated application proxying.
package proxy

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/tailnet"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/xclip"
)

const (
	CookiePrefix  = "__remote_gui_"
	loginPath     = "/__remote_gui/login"
	clipboardPath = "/__remote_gui/clipboard"
)

// MaxClipboardText is the largest clipboard text the viewer routes carry, in bytes of UTF-8.
const MaxClipboardText = xclip.MaxText

// Clipboard sets, reads and clears a browser session's remote clipboard.
// Each call also reports the browser mode it ran under.
type Clipboard interface {
	Set(ctx context.Context, text, expectedMode string) (string, error)
	Get(ctx context.Context) (string, string, error)
	Clear(ctx context.Context) (string, error)
}

type Options struct {
	OwnerLogin         string
	ServePeer          state.Peer
	ViewerAssets       string
	ViewerPassword     string
	ID                 string
	Origin             string
	Target             string
	Deadline           time.Time
	UpstreamAlive      func() bool
	UpstreamConnection func(context.Context, net.Conn) bool
	OnCompatibility    func(string)
	Clipboard          Clipboard
}
type client struct {
	probe   bool
	proof   [32]byte
	jar     http.CookieJar
	expires time.Time
}
type (
	clientKey struct{}
	Proxy     struct {
		ownerLogin         string
		servePeer          state.Peer
		assets             *os.Root
		viewerPassword     string
		landing            string
		mu                 sync.Mutex
		id                 string
		origin             *url.URL
		target             *url.URL
		deadline           time.Time
		code               [32]byte
		codeExpiry         time.Time
		hasCode            bool
		revoked            bool
		attempts           int
		attemptsUntil      time.Time
		clients            map[[32]byte]*client
		connections        map[net.Conn]bool
		reverse            *httputil.ReverseProxy
		upstreamAlive      func() bool
		upstreamConnection func(context.Context, net.Conn) bool
		onCompatibility    func(string)
		problem            string
		clipboard          Clipboard
	}
)

func New(o Options) (*Proxy, error) {
	origin, err := url.Parse(o.Origin)
	if err != nil || origin.Host == "" || origin.User != nil || origin.Path != "" || (origin.Scheme != "https" && origin.Scheme != "http") {
		return nil, errors.New("invalid proxy origin")
	}
	if !config.ValidID(o.ID) || !o.Deadline.After(time.Now()) {
		return nil, errors.New("invalid proxy session")
	}
	if origin.Scheme == "http" {
		ip := net.ParseIP(origin.Hostname())
		if ip == nil || !ip.IsLoopback() {
			return nil, errors.New("unencrypted origin must be loopback")
		}
	}
	if o.OwnerLogin != "" && (origin.Scheme != "https" || !tailnet.ValidLogin(o.OwnerLogin) || !o.ServePeer.Alive()) {
		return nil, errors.New("verified-tailscale-owner-and-peer-required")
	}
	target, err := config.Target(o.Target)
	if err != nil {
		return nil, err
	}
	landing := target.RequestURI()
	target.Path = ""
	target.RawPath = ""
	target.RawQuery = ""
	var assets *os.Root
	if o.ViewerAssets != "" {
		if o.ViewerPassword == "" {
			return nil, errors.New("viewer credentials unavailable")
		}
		assets, err = os.OpenRoot(o.ViewerAssets)
		if err != nil {
			return nil, errors.New("viewer assets unavailable")
		}
	}
	p := &Proxy{ownerLogin: o.OwnerLogin, servePeer: o.ServePeer, assets: assets, viewerPassword: o.ViewerPassword, landing: landing, id: o.ID, origin: origin, target: target, deadline: o.Deadline, clients: make(map[[32]byte]*client), connections: make(map[net.Conn]bool), upstreamAlive: o.UpstreamAlive, upstreamConnection: o.UpstreamConnection, onCompatibility: o.OnCompatibility}
	if assets != nil {
		p.clipboard = o.Clipboard
	}
	p.reverse = &httputil.ReverseProxy{Rewrite: p.rewrite, ModifyResponse: p.response, ErrorLog: log.New(io.Discard, "", 0), ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
		p.fail("upstream-or-compatibility-failure")
		http.Error(w, "application proxy unavailable", http.StatusBadGateway)
	}, Transport: &http.Transport{Proxy: nil, DialContext: p.checkedDial((&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 15 * time.Second}).DialContext), ResponseHeaderTimeout: 5 * time.Second, IdleConnTimeout: 30 * time.Second, MaxIdleConnsPerHost: 8, MaxResponseHeaderBytes: 1 << 20}}
	return p, nil
}

func random() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", errors.New("session randomness unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func (p *Proxy) Issue() (string, error) {
	if p.ownerLogin != "" {
		return "", errors.New("tailscale-access-uses-owner-identity-without-code")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	if p.revoked || !now.Before(p.deadline) {
		return "", errors.New("session expired or stopped")
	}
	code, err := random()
	if err != nil {
		return "", err
	}
	p.code = sha256.Sum256([]byte(code))
	p.hasCode = true
	p.codeExpiry = now.Add(10 * time.Minute)
	if p.codeExpiry.After(p.deadline) {
		p.codeExpiry = p.deadline
	}
	return code, nil
}

func (p *Proxy) fail(code string) {
	p.mu.Lock()
	first := p.problem == ""
	if first {
		p.problem = code
	}
	callback := p.onCompatibility
	p.mu.Unlock()
	if first && callback != nil {
		callback(code)
	}
}
func (p *Proxy) Problem() string { p.mu.Lock(); defer p.mu.Unlock(); return p.problem }
func (p *Proxy) ConnState(c net.Conn, s http.ConnState) {
	if s == http.StateHijacked {
		_ = c.SetDeadline(time.Time{})
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if s == http.StateClosed {
		delete(p.connections, c)
	} else {
		p.connections[c] = true
	}
}

func (p *Proxy) Revoke() {
	p.mu.Lock()
	p.revoked = true
	p.hasCode = false
	p.clients = make(map[[32]byte]*client)
	connections := make([]net.Conn, 0, len(p.connections))
	for c := range p.connections {
		connections = append(connections, c)
	}
	p.mu.Unlock()
	for _, c := range connections {
		_ = c.Close()
	}
	p.reverse.Transport.(*http.Transport).CloseIdleConnections()
	if p.assets != nil {
		_ = p.assets.Close()
	}
}

func (p *Proxy) validOrigin(r *http.Request) bool {
	if p.ownerLogin != "" && len(r.Header.Values("Tailscale-Funnel-Request")) != 0 {
		return false
	}
	host, err := p.publicHost(r)
	if err != nil || !strings.EqualFold(host, p.origin.Host) {
		return false
	}
	if len(r.Header.Values("Origin")) > 1 {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != p.origin.String() {
		return false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site == "same-site" || site == "cross-site" {
		if p.ownerLogin != "" {
			if !topLevelNavigation(r) {
				return false
			}
		} else if site == "same-site" || r.Method != http.MethodGet {
			return false
		}
	}
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") && r.Header.Get("Origin") != p.origin.String() {
		return false
	}
	return true
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Add("Content-Security-Policy", "worker-src 'none'")
	if !p.validOrigin(r) {
		accessError(w, "request origin rejected", http.StatusForbidden)
		return
	}
	p.mu.Lock()
	ended := p.revoked || !time.Now().Before(p.deadline)
	p.mu.Unlock()
	if ended {
		accessError(w, "remote session stopped", http.StatusGone)
		return
	}
	if p.ownerLogin != "" && (r.URL.Path == loginPath || r.URL.Query().Has("__remote_gui_enroll")) {
		http.NotFound(w, r)
		return
	}
	if r.URL.Path == loginPath {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		http.Redirect(w, r, "/?__remote_gui_enroll=1", http.StatusSeeOther)
		return
	}
	if r.URL.Path == "/" && r.URL.Query().Has("__remote_gui_enroll") {
		p.enroll(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/__remote_gui") && (p.assets == nil || r.URL.Path != "/__remote_gui/viewer-access") && (p.clipboard == nil || r.URL.Path != clipboardPath) {
		http.NotFound(w, r)
		return
	}
	if (path.Clean(r.URL.Path) != r.URL.Path && path.Clean(r.URL.Path) != strings.TrimSuffix(r.URL.Path, "/")) || strings.HasPrefix(r.URL.Path, "//") || strings.Contains(r.URL.Path, "\\") {
		http.Error(w, "invalid application path", http.StatusBadRequest)
		return
	}
	c := p.authorized(r)
	if p.ownerLogin != "" && c == nil {
		c = p.identityClient(w, r)
	}
	if c == nil {
		if p.ownerLogin != "" {
			accessError(w, "remote session requires its owner's Tailscale identity", http.StatusForbidden)
			return
		}
		w.Header().Set("Referrer-Policy", "same-origin")
		showLogin(w)
		return
	}
	if len(r.Header.Values("Authorization")) > 1 || (r.Header.Get("Authorization") != "" && ((p.ownerLogin != "" && !c.probe) || !strings.HasPrefix(strings.ToLower(r.Header.Get("Authorization")), "basic "))) {
		http.Error(w, "compatibility-blocked: application Authorization headers are unsupported", http.StatusConflict)
		return
	}
	if p.upstreamAlive != nil && !p.upstreamAlive() {
		p.Revoke()
		http.Error(w, "application ownership changed", http.StatusGone)
		return
	}
	if p.clipboard != nil && r.URL.Path == clipboardPath {
		p.serveClipboard(w, r)
		return
	}
	if p.viewer(w, r) {
		return
	}
	p.reverse.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clientKey{}, c)))
}

func (p *Proxy) rewrite(r *httputil.ProxyRequest) {
	r.Out.URL.Scheme = p.target.Scheme
	r.Out.URL.Host = p.target.Host
	r.Out.Host = p.target.Host
	r.Out.Header.Del("Cookie")
	r.Out.Header.Del("Authorization")
	r.Out.Header.Del("Proxy-Authorization")
	r.Out.Header.Del("Forwarded")
	for k := range r.Out.Header {
		lower := strings.ToLower(k)
		if strings.HasPrefix(lower, "x-remote-gui-") || strings.HasPrefix(lower, "tailscale-") || strings.HasPrefix(lower, "x-forwarded-") {
			r.Out.Header.Del(k)
		}
	}
	r.Out.Header.Set("X-Forwarded-Proto", p.origin.Scheme)
	r.Out.Header.Set("X-Forwarded-Host", p.origin.Host)
	if c, ok := r.In.Context().Value(clientKey{}).(*client); ok {
		for _, cookie := range c.jar.Cookies(r.Out.URL) {
			r.Out.AddCookie(cookie)
		}
	}
}

func (p *Proxy) response(r *http.Response) error {
	c, ok := r.Request.Context().Value(clientKey{}).(*client)
	if !ok {
		return errors.New("application context missing")
	}
	if r.Header.Get("WWW-Authenticate") != "" || r.Header.Get("Proxy-Authenticate") != "" || r.Header.Get("Authentication-Info") != "" {
		r.Header.Del("WWW-Authenticate")
		r.Header.Del("Proxy-Authenticate")
		r.Header.Del("Authentication-Info")
		return errors.New("application-http-authentication-unsupported")
	}
	cookies := r.Cookies()
	r.Header.Del("Set-Cookie")
	for _, cookie := range cookies {
		if strings.HasPrefix(cookie.Name, CookiePrefix) {
			return errors.New("reserved authentication cookie rejected")
		}
		if cookie.Domain != "" && strings.TrimPrefix(strings.ToLower(cookie.Domain), ".") != strings.ToLower(p.target.Hostname()) {
			return errors.New("application cookie scope unsupported")
		}
	}
	c.jar.SetCookies(r.Request.URL, cookies)
	if location := r.Header.Get("Location"); location != "" {
		u, err := url.Parse(location)
		if err != nil {
			return errors.New("invalid application redirect")
		}
		if strings.HasPrefix(strings.ToLower(u.Path), "/__remote_gui") || u.Query().Has("__remote_gui_enroll") {
			return errors.New("application-reserved-route-collision")
		}
		if u.Scheme != "" && u.Scheme != "http" && u.Scheme != "https" {
			return errors.New("unsupported application redirect scheme")
		}
		if u.IsAbs() || u.Host != "" {
			if u.User != nil {
				return errors.New("credential-bearing redirect rejected")
			}
			if u.Host == p.target.Host {
				lower := strings.ToLower(u.Path)
				if strings.Contains(lower, "oauth") || strings.Contains(lower, "callback") {
					return errors.New("authentication callback needs its owning workflow")
				}
				u.Scheme = p.origin.Scheme
				u.Host = p.origin.Host
				r.Header.Set("Location", u.String())
			} else if ip := net.ParseIP(u.Hostname()); (ip != nil && ip.IsLoopback()) || strings.EqualFold(u.Hostname(), "localhost") || strings.HasSuffix(strings.ToLower(u.Hostname()), ".localhost") {
				return errors.New("unshared local redirect rejected")
			}
		}
	}
	return nil
}

// serveClipboard answers the viewer panel. Responses carry only the requested
// clipboard text, the browser mode and fixed codes, and no CORS headers, so a
// cross-origin page can neither send the custom header nor read a reply.
func (p *Proxy) serveClipboard(w http.ResponseWriter, r *http.Request) {
	sites := r.Header.Values("Sec-Fetch-Site")
	if r.Header.Get("X-Remote-GUI-Clipboard") != "1" || len(sites) > 1 || (len(sites) == 1 && sites[0] != "same-origin") {
		clipboardReply(w, http.StatusForbidden, map[string]string{"error": "clipboard-request-refused"})
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != p.origin.String() {
		clipboardReply(w, http.StatusForbidden, map[string]string{"error": "clipboard-request-refused"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	switch r.Method {
	case http.MethodGet:
		text, mode, err := p.clipboard.Get(ctx)
		if err != nil {
			clipboardFailure(w, mode, err)
			return
		}
		clipboardReply(w, http.StatusOK, map[string]string{"text": text, "browser_mode": mode})
	case http.MethodPost:
		expected := r.URL.Query().Get("expected_mode")
		if expected != "human" && expected != "agent" {
			clipboardReply(w, http.StatusBadRequest, map[string]string{"error": "clipboard-mode-invalid"})
			return
		}
		media, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "text/plain" || (params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8")) {
			clipboardReply(w, http.StatusUnsupportedMediaType, map[string]string{"error": "clipboard-text-invalid"})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, MaxClipboardText+1))
		if err != nil {
			clipboardReply(w, http.StatusBadRequest, map[string]string{"error": "clipboard-text-invalid"})
			return
		}
		if len(body) > MaxClipboardText {
			clipboardReply(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "clipboard-too-large"})
			return
		}
		if !utf8.Valid(body) {
			clipboardReply(w, http.StatusBadRequest, map[string]string{"error": "clipboard-text-invalid"})
			return
		}
		mode, err := p.clipboard.Set(ctx, string(body), expected)
		if err != nil {
			clipboardFailure(w, mode, err)
			return
		}
		clipboardReply(w, http.StatusOK, map[string]string{"browser_mode": mode})
	case http.MethodDelete:
		mode, err := p.clipboard.Clear(ctx)
		if err != nil {
			clipboardFailure(w, mode, err)
			return
		}
		clipboardReply(w, http.StatusOK, map[string]string{"browser_mode": mode})
	default:
		clipboardReply(w, http.StatusMethodNotAllowed, map[string]string{"error": "clipboard-method-not-allowed"})
	}
}

// clipboardFailure reports only a fixed clipboard code, never the error's other text.
func clipboardFailure(w http.ResponseWriter, mode string, err error) {
	code, status := "clipboard-unavailable", http.StatusServiceUnavailable
	switch err.Error() {
	case "clipboard-busy":
		code, status = err.Error(), http.StatusConflict
	case "clipboard-too-large":
		code, status = err.Error(), http.StatusRequestEntityTooLarge
	case "clipboard-text-invalid":
		code, status = err.Error(), http.StatusBadRequest
	case "clipboard-timed-out", "clipboard-clear-unverified", "clipboard-ownership-unverified", "clipboard-display-unavailable":
		code = err.Error()
	}
	reply := map[string]string{"error": code}
	if mode != "" {
		reply["browser_mode"] = mode
	}
	clipboardReply(w, status, reply)
}

func clipboardReply(w http.ResponseWriter, status int, body map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
