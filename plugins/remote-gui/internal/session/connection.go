package session

import (
	"context"
	"encoding/hex"
	"errors"
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func kernelEndpoint(value string) (netip.AddrPort, error) {
	host, port, ok := strings.Cut(value, ":")
	raw, err := hex.DecodeString(host)
	if !ok || err != nil || (len(raw) != 4 && len(raw) != 16) {
		return netip.AddrPort{}, errors.New("invalid TCP endpoint")
	}
	for i := 0; i < len(raw); i += 4 {
		raw[i], raw[i+3] = raw[i+3], raw[i]
		raw[i+1], raw[i+2] = raw[i+2], raw[i+1]
	}
	ip, ok := netip.AddrFromSlice(raw)
	n, err := strconv.ParseUint(port, 16, 16)
	if !ok || err != nil {
		return netip.AddrPort{}, errors.New("invalid TCP endpoint")
	}
	return netip.AddrPortFrom(ip.Unmap(), uint16(n)), nil
}

func acceptedInode(conn net.Conn) (string, error) {
	local, err := netip.ParseAddrPort(conn.LocalAddr().String())
	if err != nil || !local.Addr().IsLoopback() {
		return "", errors.New("invalid upstream connection")
	}
	remote, err := netip.ParseAddrPort(conn.RemoteAddr().String())
	if err != nil || !remote.Addr().IsLoopback() {
		return "", errors.New("invalid upstream connection")
	}
	local = netip.AddrPortFrom(local.Addr().Unmap(), local.Port())
	remote = netip.AddrPortFrom(remote.Addr().Unmap(), remote.Port())
	var inode string
	for _, file := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		data, e := os.ReadFile(file)
		if os.IsNotExist(e) {
			continue
		}
		if e != nil {
			return "", e
		}
		for _, line := range strings.Split(string(data), "\n")[1:] {
			fields := strings.Fields(line)
			if len(fields) == 0 {
				continue
			}
			if len(fields) < 10 {
				return "", errors.New("invalid connection table")
			}
			if fields[3] != "01" || fields[9] == "0" {
				continue
			}
			server, e1 := kernelEndpoint(fields[1])
			client, e2 := kernelEndpoint(fields[2])
			if e1 != nil || e2 != nil {
				return "", errors.New("invalid connection table")
			}
			if server == remote && client == local {
				if inode != "" && inode != fields[9] {
					return "", errors.New("ambiguous upstream connection")
				}
				inode = fields[9]
			}
		}
	}
	return inode, nil
}

func connectionOwned(ctx context.Context, record state.Record, conn net.Conn) bool {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for {
		if ctx.Err() != nil {
			return false
		}
		inode, err := acceptedInode(conn)
		if err != nil {
			return false
		}
		if inode != "" {
			return ownsSocket(record.Upstream, inode)
		}
		if !bindingAlive(record) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-tick.C:
		}
	}
}
