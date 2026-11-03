package session

import (
	"encoding/hex"
	"errors"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

func listenerInodes(address string) (map[string]bool, error) {
	u, err := url.Parse(address)
	if err != nil {
		return nil, errors.New("invalid-upstream-address")
	}
	wanted, err := netip.ParseAddr(u.Hostname())
	if err != nil {
		return nil, errors.New("upstream-must-use-a-loopback-address")
	}
	wanted = wanted.Unmap()
	port, err := strconv.ParseUint(u.Port(), 10, 16)
	if err != nil {
		return nil, errors.New("invalid-upstream-port")
	}
	found := make(map[string]bool)
	for _, file := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		data, e := os.ReadFile(file)
		if os.IsNotExist(e) {
			continue
		}
		if e != nil {
			return nil, errors.New("listener-identity-unavailable")
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines[1:] {
			fields := strings.Fields(line)
			if len(fields) == 0 {
				continue
			}
			if len(fields) < 10 {
				return nil, errors.New("invalid-listener-table")
			}
			if fields[3] != "0A" {
				continue
			}
			host, p, ok := strings.Cut(fields[1], ":")
			if !ok {
				return nil, errors.New("invalid-listener-table")
			}
			n, e := strconv.ParseUint(p, 16, 16)
			if e != nil {
				return nil, errors.New("invalid-listener-table")
			}
			if n != port {
				continue
			}
			raw, e := hex.DecodeString(host)
			if e != nil || (len(raw) != 4 && len(raw) != 16) {
				return nil, errors.New("invalid-listener-address")
			}
			for i := 0; i < len(raw); i += 4 {
				raw[i], raw[i+3] = raw[i+3], raw[i]
				raw[i+1], raw[i+2] = raw[i+2], raw[i+1]
			}
			ip, ok := netip.AddrFromSlice(raw)
			if !ok {
				continue
			}
			ip = ip.Unmap()
			if ip == wanted || (ip.IsUnspecified() && ip.Is4() == wanted.Is4()) {
				found[fields[9]] = true
			}
		}
	}
	return found, nil
}

func ownsSocket(id state.Identity, inode string) bool {
	if !state.Alive(id) {
		return false
	}
	entries, err := os.ReadDir("/proc/" + strconv.Itoa(id.PID) + "/fd")
	if err != nil {
		return false
	}
	want := "socket:[" + inode + "]"
	for _, e := range entries {
		target, err := os.Readlink("/proc/" + strconv.Itoa(id.PID) + "/fd/" + e.Name())
		if err == nil && target == want {
			return state.Alive(id)
		}
	}
	return false
}

func discover(address string) (state.Identity, string, error) {
	var none state.Identity
	inodes, err := listenerInodes(address)
	if err != nil {
		return none, "", err
	}
	if len(inodes) != 1 {
		return none, "", errors.New("upstream-listener-identity-is-missing-or-ambiguous")
	}
	var inode string
	for key := range inodes {
		inode = key
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return none, "", errors.New("upstream-process-identity-unavailable")
	}
	pids := []int{os.Getpid(), os.Getppid()}
	for _, e := range entries {
		pid, e := strconv.Atoi(e.Name())
		if e == nil {
			pids = append(pids, pid)
		}
	}
	for _, pid := range pids {
		id, e := state.Inspect(pid)
		if e == nil && ownsSocket(id, inode) {
			return id, inode, nil
		}
	}
	return none, "", errors.New("upstream-process-ownership-cannot-be-verified")
}

func bindingAlive(r state.Record) bool {
	inodes, err := listenerInodes(r.Config.Target)
	return err == nil && inodes[r.UpstreamSocket] && ownsSocket(r.Upstream, r.UpstreamSocket)
}
