package state

import (
	"errors"
	"net"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// Peer pins a local Unix peer for authentication only. It never grants process
// ownership or permission to signal a process belonging to another OS account.
type Peer struct {
	PID   int    `json:"pid"`
	UID   uint32 `json:"uid"`
	Start string `json:"start"`
	Boot  string `json:"boot"`
}

func peerBirth(pid int, uid uint32) (Peer, error) {
	none := Peer{}
	if pid <= 0 {
		return none, errors.New("daemon-peer-unavailable")
	}
	directory := "/proc/" + strconv.Itoa(pid)
	data, err := os.ReadFile(directory + "/stat")
	if err != nil {
		return none, errors.New("daemon-birth-identity-unavailable")
	}
	end := strings.LastIndexByte(string(data), ')')
	if end < 0 {
		return none, errors.New("invalid-daemon-birth-identity")
	}
	fields := strings.Fields(string(data)[end+1:])
	if len(fields) < 20 || fields[0] == "Z" {
		return none, errors.New("daemon-process-unavailable")
	}
	info, err := os.Stat(directory)
	if err != nil {
		return none, errors.New("daemon-process-unavailable")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != uid {
		return none, errors.New("daemon-peer-owner-changed")
	}
	boot, err := os.ReadFile("/proc/sys/kernel/random/boot_id")
	if err != nil {
		return none, errors.New("daemon-boot-identity-unavailable")
	}
	return Peer{PID: pid, UID: uid, Start: fields[19], Boot: strings.TrimSpace(string(boot))}, nil
}

func ReadPeer(conn net.Conn) (Peer, error) {
	unix, ok := conn.(*net.UnixConn)
	if !ok {
		return Peer{}, errors.New("unix-daemon-peer-required")
	}
	raw, err := unix.SyscallConn()
	if err != nil {
		return Peer{}, errors.New("unix-daemon-peer-unavailable")
	}
	var credentials *syscall.Ucred
	var capture error
	if err = raw.Control(func(fd uintptr) {
		credentials, capture = syscall.GetsockoptUcred(int(fd), syscall.SOL_SOCKET, syscall.SO_PEERCRED)
	}); err != nil || capture != nil || credentials == nil {
		return Peer{}, errors.New("unix-daemon-peer-unavailable")
	}
	return peerBirth(int(credentials.Pid), credentials.Uid)
}

func (p Peer) Alive() bool {
	got, err := peerBirth(p.PID, p.UID)
	return err == nil && p.Start != "" && p.Boot != "" && got == p
}

func (p Peer) Matches(conn net.Conn) bool {
	got, err := ReadPeer(conn)
	return err == nil && got == p && p.Alive()
}
