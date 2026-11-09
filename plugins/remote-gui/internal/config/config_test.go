package config

import (
	"encoding/json"
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
