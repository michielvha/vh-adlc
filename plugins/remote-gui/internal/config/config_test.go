package config

import (
	"testing"
	"time"
)

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
