package tailnet

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// ValidLogin accepts one exact identity, never a wildcard or a header list.
func ValidLogin(login string) bool {
	if login == "" || len(login) > 320 || !utf8.ValidString(login) || strings.ContainsAny(login, ",*") {
		return false
	}
	for _, r := range login {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// ResolveOwner reads status on the same Unix connection whose kernel peer is
// pinned. No credential, display name or HTTP header determines daemon identity.
func (c *Client) ResolveOwner(ctx context.Context, requested string) (string, state.Peer, error) {
	none := state.Peer{}
	if requested != "" && !ValidLogin(requested) {
		return "", none, errors.New("invalid-tailscale-owner-login")
	}
	if c.socket == "" {
		return "", none, errors.New("unix-tailscale-localapi-required")
	}
	conn, err := (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "unix", c.socket)
	if err != nil {
		return "", none, errors.New("tailscale-localapi-unavailable")
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
	peer, err := state.ReadPeer(conn)
	if err != nil {
		return "", none, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://local-tailscaled.sock/localapi/v0/status?peers=false", nil)
	if err != nil {
		return "", none, errors.New("invalid-tailscale-status-request")
	}
	req.Header.Set("Sec-Tailscale", "localapi")
	if err = req.Write(conn); err != nil {
		return "", none, errors.New("tailscale-status-unavailable")
	}
	response, err := http.ReadResponse(bufio.NewReader(conn), req)
	if err != nil {
		return "", none, errors.New("tailscale-status-unavailable")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return "", none, errors.New("tailscale-status-unavailable")
	}
	var status struct {
		BackendState string
		Self         struct {
			UserID int64
			Tags   []string
		}
		User map[string]struct{ LoginName string }
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&status); err != nil {
		return "", none, errors.New("invalid-tailscale-status")
	}
	if status.BackendState != "Running" {
		return "", none, errors.New("tailscale-not-running")
	}
	if !peer.Alive() {
		return "", none, errors.New("tailscale-daemon-identity-changed")
	}
	login := requested
	if login == "" && len(status.Self.Tags) == 0 {
		login = status.User[strconv.FormatInt(status.Self.UserID, 10)].LoginName
	}
	if !ValidLogin(login) {
		return "", none, errors.New("tailscale-owner-unavailable: specify --owner-login for the intended human identity")
	}
	return login, peer, nil
}
