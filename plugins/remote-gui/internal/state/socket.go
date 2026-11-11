package state

import (
	"errors"
	"os"
	"path/filepath"
)

func CaptureSocket(name string) (*FileIdentity, error) {
	if !filepath.IsAbs(name) || filepath.Clean(name) != name {
		return nil, errors.New("invalid-private-socket-path")
	}
	info, err := os.Lstat(name)
	if err != nil || info.Mode()&os.ModeSocket == 0 || info.Mode().Perm() != 0o600 {
		return nil, errors.New("private-socket-permissions-unverified")
	}
	identity, err := fingerprint(name)
	if err != nil {
		return nil, errors.New("private-socket-ownership-unverified")
	}
	return &identity, nil
}

func ReleaseSocket(name string, want *FileIdentity) error {
	if _, err := os.Lstat(name); os.IsNotExist(err) {
		return nil
	}
	got, err := CaptureSocket(name)
	if err != nil || want == nil || want.Inode == 0 || *got != *want {
		return errors.New("private-socket-ownership-changed")
	}
	if err = os.Remove(name); err != nil && !os.IsNotExist(err) {
		return errors.New("private-socket-cleanup-pending")
	}
	return nil
}
