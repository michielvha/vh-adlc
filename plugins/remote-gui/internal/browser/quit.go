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
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "tcp", r.vncAddress)
	if err != nil {
		return errors.New("browser-quit-display-unavailable")
	}
	defer func() { _ = conn.Close() }()
	deadline := time.Now().Add(3 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	if err = conn.SetDeadline(deadline); err != nil {
		return errors.New("browser-quit-display-unavailable")
	}
	if err = authenticateVNC(conn, r.current.Password); err != nil {
		return err
	}
	// Chrome documents Alt+F followed by X as its Windows/Linux Exit shortcut.
	keys := []struct {
		down bool
		key  uint32
	}{{true, 0xffe9}, {true, 'f'}, {false, 'f'}, {false, 0xffe9}, {true, 'x'}, {false, 'x'}}
	for index, key := range keys {
		if index == 4 {
			// Let the native menu open before sending its Exit mnemonic.
			time.Sleep(150 * time.Millisecond)
		}
		var event [8]byte
		event[0] = 4
		if key.down {
			event[1] = 1
		}
		binary.BigEndian.PutUint32(event[4:], key.key)
		if _, err = conn.Write(event[:]); err != nil {
			return errors.New("browser-quit-input-unavailable")
		}
	}
	return nil
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
