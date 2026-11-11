package state

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"syscall"
)

type FileIdentity struct {
	Device   uint64 `json:"device"`
	Inode    uint64 `json:"inode"`
	Modified int64  `json:"modified"`
}
type Display struct {
	Number int          `json:"number"`
	Owner  Identity     `json:"owner"`
	Lock   FileIdentity `json:"lock"`
	Socket FileIdentity `json:"socket"`
}

func DisplayPaths(number int) (string, string) {
	n := strconv.Itoa(number)
	return "/tmp/.X" + n + "-lock", "/tmp/.X11-unix/X" + n
}

func fingerprint(name string) (FileIdentity, error) {
	f, err := os.Lstat(name)
	if err != nil {
		return FileIdentity{}, err
	}
	s, ok := f.Sys().(*syscall.Stat_t)
	if !ok || s.Uid != uint32(os.Getuid()) || f.Mode()&os.ModeSymlink != 0 {
		return FileIdentity{}, errors.New("display-file-ownership-unverified")
	}
	return FileIdentity{Device: uint64(s.Dev), Inode: s.Ino, Modified: f.ModTime().UnixNano()}, nil
}

func CaptureDisplay(number int, owner Identity) (*Display, error) {
	if number < 100 || number > 65000 || !Alive(owner) {
		return nil, errors.New("display-process-ownership-unverified")
	}
	lock, socket := DisplayPaths(number)
	data, err := os.ReadFile(lock)
	if err != nil || strings.TrimSpace(string(data)) != strconv.Itoa(owner.PID) {
		return nil, errors.New("display-lock-ownership-unverified")
	}
	a, err := fingerprint(lock)
	if err != nil {
		return nil, err
	}
	b, err := fingerprint(socket)
	if err != nil {
		return nil, err
	}
	return &Display{Number: number, Owner: owner, Lock: a, Socket: b}, nil
}

func ReleaseDisplay(d *Display) error {
	if d == nil {
		return nil
	}
	if d.Number < 100 || d.Number > 65000 {
		return errors.New("invalid-owned-display")
	}
	if Alive(d.Owner) {
		return errors.New("owned-display-still-running")
	}
	lock, socket := DisplayPaths(d.Number)
	for name, want := range map[string]FileIdentity{lock: d.Lock, socket: d.Socket} {
		got, err := fingerprint(name)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil || want.Inode == 0 || got != want {
			return errors.New("display-resource-ownership-changed")
		}
	}
	for _, name := range []string{lock, socket} {
		if err := os.Remove(name); err != nil && !os.IsNotExist(err) {
			return errors.New("display-resource-cleanup-pending")
		}
	}
	return nil
}
