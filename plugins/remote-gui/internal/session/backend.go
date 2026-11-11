package session

import (
	"errors"
	"net"
	"os"
	"path/filepath"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func reserveBackend(r state.Record) (net.Listener, *state.FileIdentity, error) {
	if r.Config.Transport != "tailscale" {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		return listener, nil, err
	}
	name := filepath.Join(r.Config.Home, r.ID, "proxy.sock")
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		return nil, nil, errors.New("private-proxy-socket-unavailable")
	}
	listener.SetUnlinkOnClose(false)
	if err = os.Chmod(name, 0o600); err != nil {
		_ = listener.Close()
		return nil, nil, errors.New("private-proxy-socket-permissions-failed")
	}
	lease, err := state.CaptureSocket(name)
	if err != nil {
		_ = listener.Close()
		return nil, nil, err
	}
	return listener, lease, nil
}

func releaseBackend(r state.Record) error {
	if r.ProxyNetwork != "unix" {
		return nil
	}
	if r.ProxyAddress != filepath.Join(r.Config.Home, r.ID, "proxy.sock") {
		return errors.New("private-proxy-socket-path-changed")
	}
	return state.ReleaseSocket(r.ProxyAddress, r.ProxySocket)
}
