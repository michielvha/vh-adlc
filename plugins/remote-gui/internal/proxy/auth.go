package proxy

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"time"
)

const loginPage = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Remote session access</title></head><body><h1>Open remote session</h1><p>Use a fresh isolated private browser window for this session. Close previous remote-gui private contexts first.</p><p>In the browser's authentication prompt, use username <strong>viewer</strong> and the one-time code from your task chat as the password. Do not enter a provider password.</p><a href="/?__remote_gui_enroll=1">Open session</a></body></html>`

// Grant is an internal transport-probe proof pair, never a public status value.
type Grant struct {
	Cookie        *http.Cookie
	Authorization string
}

func (p *Proxy) authorized(r *http.Request) *client {
	if len(r.Header.Values("Authorization")) != 1 || len(r.Header.Get("Authorization")) > 512 {
		return nil
	}
	user, password, ok := r.BasicAuth()
	if !ok || user != "viewer" || password == "" {
		return nil
	}
	var token string
	count := 0
	for _, cookie := range r.Cookies() {
		if cookie.Name == CookiePrefix+p.id {
			token = cookie.Value
			count++
		}
	}
	if count != 1 || len(token) != 43 {
		return nil
	}
	key := sha256.Sum256([]byte(token))
	proof := sha256.Sum256([]byte(password))
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked || !time.Now().Before(p.deadline) {
		return nil
	}
	c := p.clients[key]
	if c == nil || !time.Now().Before(c.expires) || (p.ownerLogin != "" && !c.probe) {
		delete(p.clients, key)
		return nil
	}
	if subtle.ConstantTimeCompare(proof[:], c.proof[:]) != 1 {
		return nil
	}
	return c
}

func (p *Proxy) challenge(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Basic realm="remote-gui-`+p.id+`", charset="UTF-8"`)
	http.Error(w, "Enter username viewer and the one-time code in the browser prompt.", http.StatusUnauthorized)
}

func (p *Proxy) createGrant(password string) (*Grant, error) {
	token, err := random()
	if err != nil {
		return nil, err
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	p.clients[sha256.Sum256([]byte(token))] = &client{probe: p.ownerLogin != "", proof: sha256.Sum256([]byte(password)), jar: jar, expires: p.deadline}
	return &Grant{Cookie: &http.Cookie{Name: CookiePrefix + p.id, Value: token, Path: "/", HttpOnly: true, Secure: p.origin.Scheme == "https", SameSite: http.SameSiteStrictMode, Expires: p.deadline}, Authorization: "Basic " + base64.StdEncoding.EncodeToString([]byte("viewer:"+password))}, nil
}

func (p *Proxy) enroll(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "same-origin")
	if r.Method != http.MethodGet || r.URL.RawQuery != "__remote_gui_enroll=1" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if p.authorized(r) != nil {
		http.Redirect(w, r, p.landing, http.StatusSeeOther)
		return
	}
	user, password, ok := r.BasicAuth()
	if len(r.Header.Values("Authorization")) != 1 || len(r.Header.Get("Authorization")) > 512 || !ok || user != "viewer" || password == "" {
		p.challenge(w)
		return
	}
	hash := sha256.Sum256([]byte(password))
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
		p.challenge(w)
		return
	}
	if len(p.clients) >= 64 {
		p.mu.Unlock()
		http.Error(w, "session client limit reached", http.StatusTooManyRequests)
		return
	}
	grant, err := p.createGrant(password)
	if err != nil {
		p.mu.Unlock()
		http.Error(w, "enrollment unavailable", http.StatusServiceUnavailable)
		return
	}
	p.hasCode = false
	p.code = [32]byte{}
	p.mu.Unlock()
	http.SetCookie(w, grant.Cookie)
	http.Redirect(w, r, p.landing, http.StatusSeeOther)
}

func (p *Proxy) ProbeGrant() (*Grant, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked || !time.Now().Before(p.deadline) || len(p.clients) >= 64 {
		return nil, errors.New("session expired, stopped or full")
	}
	password, err := random()
	if err != nil {
		return nil, err
	}
	return p.createGrant(password)
}

func showLogin(w http.ResponseWriter) {
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = io.WriteString(w, loginPage)
}
