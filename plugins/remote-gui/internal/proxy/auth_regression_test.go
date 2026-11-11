package proxy

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCookieAloneCannotAuthenticate(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, server := fixture(t, upstream.URL)
	cookie := enroll(t, p, server)
	request, _ := http.NewRequest(http.MethodGet, server.URL+"/", nil)
	request.AddCookie(cookie.Cookie)
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode == 200 {
		t.Fatal("cookie-only replay authenticated; origin-scoped proof was not required")
	}
}

func TestBothProofsAndProxyHeaderBoundary(t *testing.T) {
	var leaked atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Proxy-Authorization") != "" {
			leaked.Store(true)
		}
		if r.URL.Path == "/challenge" {
			w.Header().Set("WWW-Authenticate", `Basic realm="upstream"`)
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	p, server := fixture(t, upstream.URL)
	credential := enroll(t, p, server)
	for _, mode := range []string{"none", "credential-only", "binding-only", "wrong-credential", "duplicate-authorization", "both"} {
		request, _ := http.NewRequest(http.MethodGet, server.URL+"/", nil)
		switch mode {
		case "credential-only":
			request.SetBasicAuth("viewer", credential.Code)
		case "binding-only":
			request.AddCookie(credential.Cookie)
		case "wrong-credential":
			request.AddCookie(credential.Cookie)
			request.SetBasicAuth("viewer", "wrong")
		case "duplicate-authorization":
			credential.apply(request)
			request.Header.Add("Authorization", request.Header.Get("Authorization"))
		case "both":
			credential.apply(request)
			request.Header.Set("Proxy-Authorization", "synthetic-not-for-app")
		}
		response, err := server.Client().Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if (response.StatusCode == 200) != (mode == "both") {
			t.Fatalf("proof requirement failed: %s, status %d", mode, response.StatusCode)
		}
	}
	if leaked.Load() {
		t.Fatal("proxy authentication reached upstream")
	}
	response := get(t, server, "/challenge", credential)
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != 502 || response.Header.Get("WWW-Authenticate") != "" || p.Problem() == "" {
		t.Fatal("upstream replaced the proxy's HTTP protection space")
	}
}

func TestNativeEnrollmentContainsNoCodeAndCannotBeFramed(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer upstream.Close()
	p, server := fixture(t, upstream.URL)
	code, _ := p.Issue()
	response := get(t, server, "/")
	defer func() { _ = response.Body.Close() }()
	body, _ := io.ReadAll(response.Body)
	if bytes.Contains(body, []byte(code)) || bytes.Contains(body, []byte("type=\"password\"")) || response.Header.Get("WWW-Authenticate") != "" {
		t.Fatal("initial page exposed a code field or native challenge")
	}
	if !strings.Contains(response.Header.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("code instructions can be framed")
	}
	challenge := get(t, server, "/?__remote_gui_enroll=1")
	defer func() { _ = challenge.Body.Close() }()
	if challenge.StatusCode != 401 || !strings.Contains(challenge.Header.Get("WWW-Authenticate"), "remote-gui-"+p.id) {
		t.Fatal("native enrollment challenge missing")
	}
}
