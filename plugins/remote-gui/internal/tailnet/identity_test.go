package tailnet

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOwnerResolutionPinsTheLocalAPIPeer(t *testing.T) {
	for _, tc := range []struct {
		name, status, override, want string
		fail                         bool
	}{
		{"profile", `{"BackendState":"Running","Self":{"UserID":7},"User":{"7":{"LoginName":"owner@example.test"}}}`, "", "owner@example.test", false},
		{"explicit", `{"BackendState":"Running","Self":{"Tags":["tag:agent"]}}`, "human@example.test", "human@example.test", false},
		{"tagged", `{"BackendState":"Running","Self":{"UserID":7,"Tags":["tag:agent"]},"User":{"7":{"LoginName":"owner@example.test"}}}`, "", "", true},
		{"missing", `{"BackendState":"Running","Self":{}}`, "", "", true},
		{"invalid", `{"BackendState":"Running"}`, "*", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			socket := filepath.Join(t.TempDir(), "api.sock")
			listener, e := net.Listen("unix", socket)
			if e != nil {
				t.Fatal(e)
			}
			server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/localapi/v0/status" {
					t.Error("unexpected API path")
				}
				_, _ = io.WriteString(w, tc.status)
			})}
			go func() { _ = server.Serve(listener) }()
			defer func() { _ = server.Close() }()
			owner, peer, e := New(socket).ResolveOwner(context.Background(), tc.override)
			if tc.fail {
				if e == nil {
					t.Fatal("invalid owner accepted")
				}
				return
			}
			if e != nil || owner != tc.want || peer.PID != os.Getpid() || !peer.Alive() {
				t.Fatalf("owner or kernel daemon pin failed: %v", e)
			}
		})
	}
}
