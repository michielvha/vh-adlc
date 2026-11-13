package browser

import (
	"context"
	"crypto/des"
	"encoding/binary"
	"errors"
	"io"
	"math/bits"
	"net"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/session"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
)

// Chromium opens its app menu late on a busy host, so the quit waits this long
// for the menu before it gives up without typing the Exit mnemonic.
const menuWait = 5 * time.Second

// Quit through the owned display so Chrome can flush its native session state.
// An outstanding browser confirmation is left to the owner instead of killing it.
func (r *runtime) quitBrowser(ctx context.Context) error {
	owned := false
	for _, process := range r.children {
		if process.role == "vnc" && state.Alive(process.identity) && session.OwnsListener("http://"+r.vncAddress, process.identity) {
			owned = true
		}
	}
	if !owned {
		return errors.New("browser-quit-display-ownership-changed")
	}
	if r.clip == nil {
		return errors.New("browser-quit-menu-unverified")
	}
	before, err := r.clip.Menus(ctx)
	if err != nil {
		return errors.New("browser-quit-menu-unverified")
	}
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "tcp", r.vncAddress)
	if err != nil {
		return errors.New("browser-quit-display-unavailable")
	}
	defer func() { _ = conn.Close() }()
	if err = setVNCDeadline(ctx, conn); err != nil {
		return err
	}
	if err = authenticateVNC(conn, r.current.Password); err != nil {
		return err
	}
	// Chrome documents Alt+F followed by X as its Windows/Linux Exit shortcut.
	if err = sendKeys(conn, keyAlt, 'f'); err != nil {
		return err
	}
	// An X typed before the menu opens reaches the focused page instead.
	if err = r.awaitMenu(ctx, before); err != nil {
		return err
	}
	if err = setVNCDeadline(ctx, conn); err != nil {
		return err
	}
	return sendKeys(conn, 'x')
}

const keyAlt = 0xffe9

// sendKeys presses the keys in order and releases them in reverse, as a chord.
func sendKeys(conn net.Conn, keys ...uint32) error {
	events := make([]byte, 0, 16*len(keys))
	event := func(down bool, key uint32) {
		var e [8]byte
		e[0] = 4
		if down {
			e[1] = 1
		}
		binary.BigEndian.PutUint32(e[4:], key)
		events = append(events, e[:]...)
	}
	for _, key := range keys {
		event(true, key)
	}
	for i := len(keys) - 1; i >= 0; i-- {
		event(false, keys[i])
	}
	if _, err := conn.Write(events); err != nil {
		return errors.New("browser-quit-input-unavailable")
	}
	return nil
}

func setVNCDeadline(ctx context.Context, conn net.Conn) error {
	deadline := time.Now().Add(3 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	if err := conn.SetDeadline(deadline); err != nil {
		return errors.New("browser-quit-display-unavailable")
	}
	return nil
}

// awaitMenu waits for a menu window that was not open before Alt+F. The
// display is private to this session, so a new menu is Chromium's app menu.
func (r *runtime) awaitMenu(ctx context.Context, before map[uint32]bool) error {
	ctx, cancel := context.WithTimeout(ctx, menuWait)
	defer cancel()
	for {
		menus, err := r.clip.Menus(ctx)
		if err != nil && ctx.Err() == nil {
			return errors.New("browser-quit-menu-unverified")
		}
		for window := range menus {
			if !before[window] {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return errors.New("browser-quit-menu-not-open")
		case <-time.After(25 * time.Millisecond):
		}
	}
}

// x11vnc uses the existing RFB password challenge on its private loopback listener.
func authenticateVNC(conn net.Conn, password string) error {
	failure := errors.New("browser-quit-display-authentication-failed")
	var version [12]byte
	if _, err := io.ReadFull(conn, version[:]); err != nil || string(version[:]) != "RFB 003.008\n" {
		return failure
	}
	if _, err := io.WriteString(conn, "RFB 003.008\n"); err != nil {
		return failure
	}
	var count [1]byte
	if _, err := io.ReadFull(conn, count[:]); err != nil || count[0] == 0 {
		return failure
	}
	security := make([]byte, int(count[0]))
	if _, err := io.ReadFull(conn, security); err != nil {
		return failure
	}
	passwordAuth := false
	for _, kind := range security {
		passwordAuth = passwordAuth || kind == 2
	}
	if !passwordAuth {
		return failure
	}
	if _, err := conn.Write([]byte{2}); err != nil {
		return failure
	}
	var challenge, response [16]byte
	if _, err := io.ReadFull(conn, challenge[:]); err != nil {
		return failure
	}
	var key [8]byte
	copy(key[:], password)
	for i := range key {
		key[i] = bits.Reverse8(key[i])
	}
	cipher, err := des.NewCipher(key[:])
	if err != nil {
		return failure
	}
	cipher.Encrypt(response[:8], challenge[:8])
	cipher.Encrypt(response[8:], challenge[8:])
	if _, err = conn.Write(response[:]); err != nil {
		return failure
	}
	var result [4]byte
	if _, err = io.ReadFull(conn, result[:]); err != nil || binary.BigEndian.Uint32(result[:]) != 0 {
		return failure
	}
	// A shared client preserves the human's existing viewer connection.
	if _, err = conn.Write([]byte{1}); err != nil {
		return failure
	}
	var init [24]byte
	if _, err = io.ReadFull(conn, init[:]); err != nil {
		return failure
	}
	nameSize := binary.BigEndian.Uint32(init[20:])
	if nameSize > 1<<16 {
		return failure
	}
	if _, err = io.CopyN(io.Discard, conn, int64(nameSize)); err != nil {
		return failure
	}
	return nil
}
