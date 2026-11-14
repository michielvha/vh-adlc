// Package config resolves settings from flags and PASEO_HOSTS_* variables.
package config

import (
	"path/filepath"
	"strconv"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

// Config holds every operator-host setting.
type Config struct {
	Dir        string
	Client     string
	Version    string
	ListenPort int
	ServePort  int
	Cache      string
	ClientKey  string
}

// Flags are command-line values that override variables when set.
type Flags struct {
	Client     string
	ListenPort int
	ServePort  int
}

// Load reads the variables through getenv and applies flags on top.
func Load(getenv func(string) string, flags Flags) (Config, error) {
	home := getenv("HOME")
	or := func(key, def string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return def
	}
	cacheHome := or("XDG_CACHE_HOME", filepath.Join(home, ".cache"))
	c := Config{
		Dir:       or("PASEO_HOSTS_DIR", filepath.Join(home, ".config", "paseo-hosts")),
		Client:    getenv("PASEO_HOSTS_CLIENT"),
		Version:   or("PASEO_HOSTS_VERSION", "0.14.0"),
		Cache:     or("PASEO_HOSTS_CACHE", filepath.Join(cacheHome, "paseo-hosts")),
		ClientKey: or("PASEO_HOSTS_CLIENT_KEY", "id_ed25519_paseo"),
	}
	var err error
	if c.ListenPort, err = port("PASEO_HOSTS_LISTEN_PORT", or("PASEO_HOSTS_LISTEN_PORT", "6767")); err != nil {
		return c, err
	}
	if c.ServePort, err = port("PASEO_HOSTS_SERVE_PORT", or("PASEO_HOSTS_SERVE_PORT", "8956")); err != nil {
		return c, err
	}
	if flags.Client != "" {
		c.Client = flags.Client
	}
	if flags.ListenPort != 0 {
		c.ListenPort = flags.ListenPort
	}
	if flags.ServePort != 0 {
		c.ServePort = flags.ServePort
	}
	return c, nil
}

// RequireClient returns the client alias or an exit-3 error naming the variable.
func (c Config) RequireClient() (string, error) {
	if c.Client == "" {
		return "", report.Errorf(report.ExitConfig, "no client alias: pass --client or set PASEO_HOSTS_CLIENT")
	}
	return c.Client, nil
}

func port(name, v string) (int, error) {
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > 65535 {
		return 0, report.Errorf(report.ExitConfig, "%s is not a port: %q", name, v)
	}
	return n, nil
}
