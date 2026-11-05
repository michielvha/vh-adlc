package proxy

import (
	"context"
	"crypto/sha256"
	"errors"
	"mime"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"
)

type servePeerKey struct{}

// ConnContext stamps kernel-verified ingress. HTTP fields can never supply it.
func (p *Proxy) ConnContext(ctx context.Context, conn net.Conn) context.Context {
	return context.WithValue(ctx, servePeerKey{}, p.ownerLogin != "" && p.servePeer.Matches(conn))
}

func (p *Proxy) trustedServe(r *http.Request) bool {
	trusted, _ := r.Context().Value(servePeerKey{}).(bool)
	return trusted && p.servePeer.Alive()
}

func (p *Proxy) identityClient(w http.ResponseWriter, r *http.Request) *client {
	if !p.trustedServe(r) || len(r.Header.Values("Tailscale-User-Login")) != 1 || r.Header.Get("Tailscale-User-Login") != mime.QEncoding.Encode("utf-8", p.ownerLogin) || len(r.Header.Values("Tailscale-Funnel-Request")) != 0 {
		return nil
	}
	var binding string
	count := 0
	for _, c := range r.Cookies() {
		if c.Name == CookiePrefix+p.id {
			binding = c.Value
			count++
		}
	}
	if count > 1 {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.revoked || !time.Now().Before(p.deadline) {
		return nil
	}
	if count == 1 && len(binding) == 43 {
		key := sha256.Sum256([]byte(binding))
		if c := p.clients[key]; c != nil && !c.probe && time.Now().Before(c.expires) {
			return c
		}
	}
	if len(p.clients) >= 64 {
		return nil
	}
	token, err := random()
	if err != nil {
		return nil
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil
	}
	c := &client{jar: jar, expires: p.deadline}
	p.clients[sha256.Sum256([]byte(token))] = c
	http.SetCookie(w, &http.Cookie{Name: CookiePrefix + p.id, Value: token, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, Expires: p.deadline})
	return c
}

func (p *Proxy) publicHost(r *http.Request) (string, error) {
	if p.ownerLogin == "" {
		return r.Host, nil
	}
	if p.trustedServe(r) {
		if r.Host != "localhost" || len(r.Header.Values("X-Forwarded-Host")) != 1 || len(r.Header.Values("X-Forwarded-Proto")) != 1 || r.Header.Get("X-Forwarded-Proto") != "https" {
			return "", errors.New("invalid-serve-forwarded-origin")
		}
		return r.Header.Get("X-Forwarded-Host"), nil
	}
	// Private readiness proofs are independent of user identity and cannot be
	// issued through public Tailscale access metadata.
	if p.authorized(r) != nil {
		return r.Host, nil
	}
	return "", errors.New("unverified-serve-ingress")
}

func topLevelNavigation(r *http.Request) bool {
	return r.Method == http.MethodGet && r.Header.Get("Sec-Fetch-Mode") == "navigate" && r.Header.Get("Sec-Fetch-Dest") == "document" && !strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func accessError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Add("Content-Security-Policy", "frame-ancestors 'none'")
	http.Error(w, message, status)
}
