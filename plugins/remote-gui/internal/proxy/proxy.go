// Package proxy provides session-bound enrollment and isolated application proxying.
package proxy

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
)

const (
	CookiePrefix = "__remote_gui_"
	loginPath    = "/__remote_gui/login"
)

type Options struct {
	ID              string
	Origin          string
	Target          string
	Deadline        time.Time
	UpstreamAlive   func() bool
	OnCompatibility func(string)
}
type client struct {
	jar     http.CookieJar
	expires time.Time
}
type (
	clientKey struct{}
	Proxy     struct {
		landing         string
		mu              sync.Mutex
		id              string
		origin          *url.URL
		target          *url.URL
		deadline        time.Time
		code            [32]byte
		codeExpiry      time.Time
		hasCode         bool
		revoked         bool
		attempts        int
		attemptsUntil   time.Time
		clients         map[string]*client
		connections     map[net.Conn]bool
		reverse         *httputil.ReverseProxy
		upstreamAlive   func() bool
		onCompatibility func(string)
		problem         string
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
	target, err := config.Target(o.Target)
	if err != nil {
		return nil, err
	}
	landing := target.RequestURI()
	target.Path = ""
	target.RawPath = ""
	target.RawQuery = ""
	p := &Proxy{landing: landing, id: o.ID, origin: origin, target: target, deadline: o.Deadline, clients: make(map[string]*client), connections: make(map[net.Conn]bool), upstreamAlive: o.UpstreamAlive, onCompatibility: o.OnCompatibility}
	p.reverse = &httputil.ReverseProxy{Rewrite: p.rewrite, ModifyResponse: p.response, ErrorLog: log.New(io.Discard, "", 0), ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
		p.fail("upstream-or-compatibility-failure")
		http.Error(w, "application proxy unavailable", http.StatusBadGateway)
	}, Transport: &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 15 * time.Second}).DialContext, ResponseHeaderTimeout: 5 * time.Second, IdleConnTimeout: 30 * time.Second, MaxIdleConnsPerHost: 8, MaxResponseHeaderBytes: 1 << 20}}
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
	p.clients = make(map[string]*client)
	connections := make([]net.Conn, 0, len(p.connections))
	for c := range p.connections {
		connections = append(connections, c)
	}
	p.mu.Unlock()
	for _, c := range connections {
		_ = c.Close()
	}
	p.reverse.Transport.(*http.Transport).CloseIdleConnections()
}

func (p *Proxy) validOrigin(r *http.Request) bool {
	if !strings.EqualFold(r.Host, p.origin.Host) {
		return false
	}
	if len(r.Header.Values("Origin")) > 1 {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != p.origin.String() {
		return false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site == "same-site" || (site == "cross-site" && r.Method != http.MethodGet) {
		return false
	}
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") && r.Header.Get("Origin") != p.origin.String() {
		return false
	}
	return true
}

func (p *Proxy) authorized(r *http.Request) *client {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked || !time.Now().Before(p.deadline) {
		return nil
	}
	var token string
	count := 0
	for _, c := range r.Cookies() {
		if c.Name == CookiePrefix+p.id {
			token = c.Value
			count++
		}
	}
	if count != 1 {
		return nil
	}
	c := p.clients[token]
	if c == nil || !time.Now().Before(c.expires) {
		delete(p.clients, token)
		return nil
	}
	return c
}

var loginPage = template.Must(template.New("login").Parse(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Remote session access</title></head><body><h1>Open remote session</h1><form method="post" action="/__remote_gui/login"><label>One-time access code <input name="code" type="password" autocomplete="off" required></label><input type="hidden" name="return" value="{{.Return}}"><button>Open session</button></form></body></html>`))

func (p *Proxy) login(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = loginPage.Execute(w, map[string]string{"Return": p.landing})
		return
	}
	if r.Method != http.MethodPost || r.Header.Get("Origin") != p.origin.String() {
		http.Error(w, "same-origin POST required", http.StatusForbidden)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid enrollment", http.StatusBadRequest)
		return
	}
	code := r.PostForm.Get("code")
	hash := sha256.Sum256([]byte(code))
	p.mu.Lock()
	now := time.Now()
	if now.After(p.attemptsUntil) {
		p.attempts = 0
		p.attemptsUntil = now.Add(time.Minute)
	}
	if p.attempts >= 8 {
		p.mu.Unlock()
		http.Error(w, "enrollment rate limited", http.StatusTooManyRequests)
		return
	}
	p.attempts++
	if p.revoked || !now.Before(p.deadline) || !p.hasCode || !now.Before(p.codeExpiry) || subtle.ConstantTimeCompare(hash[:], p.code[:]) != 1 {
		p.mu.Unlock()
		http.Error(w, "invalid or expired access code", http.StatusUnauthorized)
		return
	}
	if len(p.clients) >= 64 {
		p.mu.Unlock()
		http.Error(w, "session client limit reached", http.StatusTooManyRequests)
		return
	}
	token, err := random()
	if err != nil {
		p.mu.Unlock()
		http.Error(w, "enrollment unavailable", http.StatusServiceUnavailable)
		return
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		p.mu.Unlock()
		http.Error(w, "enrollment unavailable", http.StatusServiceUnavailable)
		return
	}
	p.hasCode = false
	p.code = [32]byte{}
	p.clients[token] = &client{jar: jar, expires: p.deadline}
	expires := p.deadline
	p.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: CookiePrefix + p.id, Value: token, Path: "/", HttpOnly: true, Secure: p.origin.Scheme == "https", SameSite: http.SameSiteStrictMode, Expires: expires})
	destination := p.landing
	if candidate := r.PostForm.Get("return"); candidate != "" {
		u, e := url.Parse(candidate)
		if e == nil && !u.IsAbs() && u.Host == "" && strings.HasPrefix(u.Path, "/") && !strings.HasPrefix(u.Path, "//") && !strings.HasPrefix(u.Path, "/__remote_gui") && path.Clean(u.Path) == u.Path {
			destination = u.RequestURI()
		}
	}
	http.Redirect(w, r, destination, http.StatusSeeOther)
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if !p.validOrigin(r) {
		http.Error(w, "request origin rejected", http.StatusForbidden)
		return
	}
	p.mu.Lock()
	ended := p.revoked || !time.Now().Before(p.deadline)
	p.mu.Unlock()
	if ended {
		http.Error(w, "remote session stopped", http.StatusGone)
		return
	}
	if r.URL.Path == loginPath {
		p.login(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/__remote_gui") {
		http.NotFound(w, r)
		return
	}
	if path.Clean(r.URL.Path) != r.URL.Path || strings.Contains(r.URL.Path, "\\") {
		http.Error(w, "invalid application path", http.StatusBadRequest)
		return
	}
	c := p.authorized(r)
	if c == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusUnauthorized)
		_ = loginPage.Execute(w, map[string]string{"Return": r.URL.RequestURI()})
		return
	}
	if p.upstreamAlive != nil && !p.upstreamAlive() {
		p.Revoke()
		http.Error(w, "application ownership changed", http.StatusGone)
		return
	}
	p.reverse.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clientKey{}, c)))
}

func (p *Proxy) rewrite(r *httputil.ProxyRequest) {
	r.Out.URL.Scheme = p.target.Scheme
	r.Out.URL.Host = p.target.Host
	r.Out.Host = p.target.Host
	r.Out.Header.Del("Cookie")
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
			} else if ip := net.ParseIP(u.Hostname()); ip != nil && ip.IsLoopback() {
				return errors.New("unshared local redirect rejected")
			}
		}
	}
	return nil
}

// ProbeCookie issues an internal transport-probe credential. It is never exported
// through status, logs or the public CLI; browser verification remains separate.
func (p *Proxy) ProbeCookie() (*http.Cookie, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked || !time.Now().Before(p.deadline) {
		return nil, errors.New("session expired or stopped")
	}
	token, err := random()
	if err != nil {
		return nil, err
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	p.clients[token] = &client{jar: jar, expires: p.deadline}
	return &http.Cookie{Name: CookiePrefix + p.id, Value: token, Path: "/", HttpOnly: true, Secure: p.origin.Scheme == "https", SameSite: http.SameSiteStrictMode}, nil
}
