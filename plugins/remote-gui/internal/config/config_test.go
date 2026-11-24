package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBrowserModesAndHandoff(t *testing.T) {
	const id = "0123456789abcdef0123456789abcdef"
	for _, test := range []struct {
		name string
		args []string
		mode string
	}{
		{"legacy default", []string{"start"}, "agent"},
		{"human start", []string{"start", "--browser-mode", "human"}, "human"},
		{"explicit agent", []string{"start", "--browser-mode", "agent"}, "agent"},
		{"human doctor", []string{"doctor", "--kind", "browser", "--browser-mode", "human"}, "human"},
		{"hand to human", []string{"handoff", id, "--browser-mode", "human"}, "human"},
		{"hand to agent", []string{"handoff", "--browser-mode=agent", id}, "agent"},
	} {
		t.Run(test.name, func(t *testing.T) {
			c, err := Parse(test.args)
			if err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(c)
			if err != nil {
				t.Fatal(err)
			}
			var fields map[string]any
			if err := json.Unmarshal(data, &fields); err != nil {
				t.Fatal(err)
			}
			if fields["browser_mode"] != test.mode || c.Kind != "browser" {
				t.Fatalf("unexpected mode/kind: %s", data)
			}
		})
	}
	for _, args := range [][]string{
		{"handoff", id},
		{"handoff", "--browser-mode", "human"},
		{"start", "--browser-mode", "invalid"},
		{"status", "--browser-mode", "human"},
		{"share", "http://127.0.0.1:3000", "--browser-mode", "agent"},
		{"doctor", "--kind", "share", "--browser-mode", "human"},
	} {
		if _, err := Parse(args); err == nil {
			t.Fatalf("accepted inapplicable mode: %v", args)
		}
	}
}

func TestParseLifetimeAndArgumentOrder(t *testing.T) {
	for _, args := range [][]string{{"share", "http://127.0.0.1:3000/app", "--ttl", "1h", "--transport", "loopback"}, {"share", "--ttl", "1h", "--transport", "loopback", "http://127.0.0.1:3000/app"}} {
		c, err := Parse(args)
		if err != nil || c.TTL != time.Hour || c.Transport != "loopback" || c.Kind != "share" {
			t.Fatalf("parse %v: %+v %v", args, c, err)
		}
	}
	for _, ttl := range []string{"0", "-1s", "9h", "forever"} {
		if _, err := Parse([]string{"share", "http://127.0.0.1:3000", "--ttl", ttl}); err == nil {
			t.Fatalf("accepted ttl %s", ttl)
		}
	}
}

func TestRejectUnsafeTargets(t *testing.T) {
	for _, target := range []string{"http://example.com:3000", "https://127.0.0.1:3000", "http://user:password@127.0.0.1:3000", "http://127.0.0.1:0", "http://127.0.0.1:3000/json/version", "http://127.0.0.1:3000/devtools/browser/test"} {
		if _, err := Parse([]string{"share", target}); err == nil {
			t.Fatalf("accepted unsafe target %s", target)
		}
	}
}

func TestReservedEnrollmentQueryCannotBeAnAppTarget(t *testing.T) {
	if _, err := Parse([]string{"share", "http://127.0.0.1:3000/?__remote_gui_enroll=1"}); err == nil {
		t.Fatal("app target collides with native enrollment route")
	}
}

func TestTailscaleOwnerOverrideIsCreationOnly(t *testing.T) {
	c, err := Parse([]string{"start", "--owner-login", "human@example.test"})
	if err != nil || c.OwnerLogin != "human@example.test" {
		t.Fatal("explicit owner not accepted")
	}
	for _, args := range [][]string{{"start", "--transport", "loopback", "--owner-login", "human@example.test"}, {"status", "--owner-login", "human@example.test"}, {"start", "--owner-login", "*"}} {
		if _, err := Parse(args); err == nil {
			t.Fatal("ambiguous/inapplicable owner accepted")
		}
	}
}

func profileEnv(t *testing.T) string {
	t.Helper()
	base := t.TempDir()
	t.Setenv("XDG_STATE_HOME", base)
	t.Setenv("REMOTE_GUI_HOME", "")
	t.Setenv("REMOTE_GUI_PROFILE_HOME", "")
	return base
}

func TestProfileNames(t *testing.T) {
	base := profileEnv(t)
	for _, name := range []string{"a", "work", "a-b", "0abc", strings.Repeat("a", 40)} {
		c, err := Parse([]string{"start", "--profile", name})
		if err != nil || c.Profile != name || c.ProfileHome != filepath.Join(base, "remote-gui", "profiles") {
			t.Fatalf("valid profile %q: %+v %v", name, c, err)
		}
	}
	for _, name := range []string{"..", "a/b", "Work", "-a", strings.Repeat("a", 41), "", "a_b", "../x"} {
		_, err := Parse([]string{"start", "--profile", name})
		if err == nil || !strings.Contains(err.Error(), "invalid-profile-name") {
			t.Fatalf("accepted profile name %q: %v", name, err)
		}
		_, err = Parse([]string{"profile", "delete", name})
		if err == nil || !strings.Contains(err.Error(), "invalid-profile-name") {
			t.Fatalf("delete accepted profile name %q: %v", name, err)
		}
	}
	if entries, _ := os.ReadDir(base); len(entries) != 0 {
		t.Fatal("parsing touched the profile store")
	}
}

func TestProfileHomeAndCommands(t *testing.T) {
	profileEnv(t)
	override := t.TempDir()
	c, err := Parse([]string{"start", "--profile", "work", "--profile-home", override})
	if err != nil || c.ProfileHome != override {
		t.Fatalf("--profile-home ignored: %+v %v", c, err)
	}
	t.Setenv("REMOTE_GUI_PROFILE_HOME", override)
	c, err = Parse([]string{"profile", "list"})
	if err != nil || c.Command != "profile" || c.ProfileAction != "list" || c.ProfileHome != override {
		t.Fatalf("profile list: %+v %v", c, err)
	}
	c, err = Parse([]string{"profile", "delete", "work"})
	if err != nil || c.ProfileAction != "delete" || c.Profile != "work" || c.ProfileHome != override {
		t.Fatalf("profile delete: %+v %v", c, err)
	}
	for _, args := range [][]string{{"profile"}, {"profile", "frob"}, {"profile", "delete"}, {"profile", "list", "extra"}, {"profile", "delete", "a", "b"}, {"start", "--profile", "work", "--profile-home", "relative"}} {
		if _, err = Parse(args); err == nil {
			t.Fatalf("accepted invalid profile command: %v", args)
		}
	}
}

func TestOverriddenSessionsRootRequiresProfileHome(t *testing.T) {
	profileEnv(t)
	sessions := t.TempDir()
	override := t.TempDir()
	commands := [][]string{{"start", "--profile", "work"}, {"profile", "list"}, {"profile", "delete", "work"}}
	for _, args := range commands {
		if _, err := Parse(append(append([]string{}, args...), "--home", sessions)); err == nil || !strings.Contains(err.Error(), "profile-home-required") {
			t.Fatalf("--home without profile root accepted: %v %v", args, err)
		}
		c, err := Parse(append(append([]string{}, args...), "--home", sessions, "--profile-home", override))
		if err != nil || c.ProfileHome != override || c.Home != sessions {
			t.Fatalf("--profile-home not used: %v %+v %v", args, c, err)
		}
	}
	t.Setenv("REMOTE_GUI_HOME", sessions)
	for _, args := range commands {
		if _, err := Parse(args); err == nil || !strings.Contains(err.Error(), "profile-home-required") {
			t.Fatalf("REMOTE_GUI_HOME without profile root accepted: %v %v", args, err)
		}
	}
	if c, err := Parse([]string{"start"}); err != nil || c.ProfileHome != "" || c.Profile != "" {
		t.Fatalf("start without profile changed: %+v %v", c, err)
	}
	t.Setenv("REMOTE_GUI_PROFILE_HOME", override)
	for _, args := range commands {
		c, err := Parse(args)
		if err != nil || c.ProfileHome != override {
			t.Fatalf("REMOTE_GUI_PROFILE_HOME not used: %v %+v %v", args, c, err)
		}
	}
}

func TestMisplacedProfileOptions(t *testing.T) {
	profileEnv(t)
	c, err := Parse([]string{"start", "--profile", "work", "--browser-mode", "agent", "--agent-start-approved"})
	if err != nil || !c.AgentStartApproved || c.Mode() != "agent" {
		t.Fatalf("approved agent start refused: %+v %v", c, err)
	}
	home := t.TempDir()
	for _, args := range [][]string{
		{"start", "--agent-start-approved"},
		{"start", "--browser-mode", "agent", "--agent-start-approved"},
		{"start", "--profile", "work", "--agent-start-approved"},
		{"start", "--profile", "work", "--browser-mode", "human", "--agent-start-approved"},
		{"share", "http://127.0.0.1:3000", "--agent-start-approved"},
		{"status", "--agent-start-approved"},
		{"profile", "list", "--agent-start-approved"},
		{"share", "http://127.0.0.1:3000", "--profile", "work"},
		{"handoff", "0123456789abcdef0123456789abcdef", "--browser-mode", "human", "--profile", "work"},
		{"status", "--profile", "work"},
		{"start", "--profile-home", home},
		{"status", "--profile-home", home},
	} {
		if _, err := Parse(args); err == nil {
			t.Fatalf("accepted misplaced profile option: %v", args)
		}
	}
}
