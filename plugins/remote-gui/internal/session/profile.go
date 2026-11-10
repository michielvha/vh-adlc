package session

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/app"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/config"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/profile"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/tailnet"
)

var errOwnerMismatch = errors.New("profile-owner-mismatch: the profile belongs to another owner or transport kind")

// ProfileResult is the output of profile delete.
type ProfileResult struct {
	SchemaVersion int    `json:"schema_version"`
	Name          string `json:"name"`
	State         string `json:"state"`
	Result        string `json:"result"`
}

func ownerMatches(m profile.Meta, owner, transport string) bool {
	return m.OwnerLogin == owner && m.Transport == transport
}

// openProfile resolves the owner, takes the profile lock and runs every
// refusal that must leave no session record or process behind.
func openProfile(c config.Config) (*profile.Held, profile.Meta, string, error) {
	var none profile.Meta
	owner := ""
	if c.Transport == "tailscale" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		login, _, err := tailnet.New(os.Getenv("REMOTE_GUI_TAILSCALE_SOCKET")).ResolveOwner(ctx, c.OwnerLogin)
		cancel()
		if err != nil {
			return nil, none, "", err
		}
		owner = login
	}
	if m, err := profile.ReadMeta(c.ProfileHome, c.Profile); err == nil && !ownerMatches(m, owner, c.Transport) {
		return nil, none, "", errOwnerMismatch
	}
	_, statErr := os.Lstat(filepath.Join(c.ProfileHome, c.Profile))
	created := os.IsNotExist(statErr)
	held, err := profile.Acquire(c.ProfileHome, c.Profile)
	if err != nil {
		return nil, none, "", err
	}
	m, exists, err := held.Meta()
	if err == nil && exists && !ownerMatches(m, owner, c.Transport) {
		err = errOwnerMismatch
	}
	if err != nil {
		held.Release()
		return nil, none, "", err
	}
	now := time.Now().UTC()
	if !exists {
		m = profile.Meta{OwnerLogin: owner, Transport: c.Transport, Created: now, LastUsed: now}
	}
	recovery := ""
	if m.HolderID != "" {
		// Holding the lock proves the recorded holder's guard has ended.
		recovery = "cleared-stale-holder " + m.HolderID
		m.HolderID, m.HolderGuard = "", nil
	}
	err = browserCheck(c.Home, held)
	if err == nil {
		var installed int
		if installed, err = profile.InstalledMajor(app.Tool("REMOTE_GUI_CHROMIUM", "chromium-browser")); err == nil {
			if err = profile.CheckVersion(m, installed); err == nil {
				m.ChromiumMajor = installed
			}
		}
	}
	// A new profile's metadata, and with it the owner binding, is written only
	// once every refusal has passed; a refused first start leaves nothing.
	if err == nil {
		err = held.SaveMeta(m)
	}
	if err != nil {
		if created && !exists {
			_ = held.Remove()
		} else {
			held.Release()
		}
		return nil, none, "", err
	}
	return held, m, recovery, nil
}

// browserCheck refuses a profile a live Chromium still uses and names the
// recovery: cleanup for an orphaned remote-gui browser, otherwise closing it.
func browserCheck(home string, held *profile.Held) error {
	err := profile.CheckSingleton(held.Chromium())
	var running *profile.BrowserRunningError
	if !errors.As(err, &running) {
		return err
	}
	if id := browserOwner(home, running.PID); id != "" {
		return errors.New("profile-browser-still-running: session " + id + " owns the browser that uses this profile; run remote-gui cleanup until that session is no longer cleanup-pending and reports stopped or failed, then retry")
	}
	return errors.New("profile-browser-still-running: a browser on this host still uses this profile; close the browser, then retry")
}

func browserOwner(home string, pid int) string {
	if pid <= 0 {
		return ""
	}
	ids, err := state.IDs(home)
	if err != nil {
		return ""
	}
	for _, id := range ids {
		r, e := state.Load(home, id)
		if e != nil {
			continue
		}
		for _, p := range r.Owned {
			if p.Role == "browser" && p.Identity.PID == pid && state.Alive(p.Identity) {
				return id
			}
		}
	}
	return ""
}

// releaseProfile clears the holder and updates last used before the lock is
// released. Only the lock holder writes, so a released profile is left alone.
func releaseProfile(held *profile.Held) {
	if held == nil || held.File == nil {
		return
	}
	if m, exists, err := held.Meta(); err == nil && exists {
		m.HolderID, m.HolderGuard, m.LastUsed = "", nil, time.Now().UTC()
		_ = held.SaveMeta(m)
	}
	held.Release()
}

// inheritProfile adopts the lock descriptor the CLI passed to the guard and
// records the guard as the holder.
func inheritProfile(r state.Record) (*profile.Held, error) {
	file := os.NewFile(3, "profile-lock")
	if file == nil {
		return nil, errors.New("profile-lock-unavailable")
	}
	held := profile.FromFile(file, r.Config.ProfileHome, r.Config.Profile)
	if !held.Matches() {
		held.Close()
		return nil, errors.New("profile-lock-unavailable")
	}
	self, err := state.Inspect(os.Getpid())
	if err != nil {
		held.Close()
		return nil, err
	}
	m, exists, err := held.Meta()
	if err == nil && !exists {
		err = errors.New("profile-metadata-unavailable")
	}
	if err == nil {
		m.HolderID, m.HolderGuard = r.ID, &self
		err = held.SaveMeta(m)
	}
	if err != nil {
		held.Close()
		return nil, err
	}
	return held, nil
}

// checkProfileOwner runs in the supervisor before Chromium launches: the
// resolved owner and transport must equal the profile's, and the profile must
// be held by this session.
func checkProfileOwner(r state.Record, ownerLogin string) error {
	m, err := profile.ReadMeta(r.Config.ProfileHome, r.Config.Profile)
	if err != nil {
		return err
	}
	if !ownerMatches(m, ownerLogin, r.Config.Transport) {
		return errOwnerMismatch
	}
	if m.HolderID != r.ID {
		return errors.New("profile-not-held-by-session")
	}
	return nil
}

// ProfileList lists profiles without taking any lock.
func ProfileList(root string) ([]profile.Entry, error) { return profile.List(root) }

// ProfileDelete removes an idle profile that no browser on this host uses.
func ProfileDelete(home, root, name string) (ProfileResult, error) {
	result := ProfileResult{SchemaVersion: 1, Name: name, State: "missing", Result: "missing"}
	held, err := profile.AcquireExisting(root, name)
	if errors.Is(err, profile.ErrMissing) {
		return result, nil
	}
	if err != nil {
		return ProfileResult{}, err
	}
	if err = browserCheck(home, held); err != nil {
		held.Release()
		return ProfileResult{}, err
	}
	if err = held.Remove(); err != nil {
		return ProfileResult{}, err
	}
	result.State, result.Result = "deleted", "deleted"
	return result, nil
}
