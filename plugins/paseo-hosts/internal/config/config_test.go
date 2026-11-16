package config_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/config"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestDefaults(t *testing.T) {
	c, err := config.Load(env(map[string]string{"HOME": "/h"}), config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{
		Dir: "/h/.config/paseo-hosts", Version: "0.14.0", ListenPort: 6767, ServePort: 8956,
		Cache: "/h/.cache/paseo-hosts", ClientKey: "id_ed25519_paseo",
	}
	if c != want {
		t.Fatalf("got %+v\nwant %+v", c, want)
	}
	c, err = config.Load(env(map[string]string{"HOME": "/h", "XDG_CACHE_HOME": "/x"}), config.Flags{})
	if err != nil || c.Cache != "/x/paseo-hosts" {
		t.Fatalf("XDG_CACHE_HOME: %q %v", c.Cache, err)
	}
}

func TestVariablesAndFlags(t *testing.T) {
	vars := map[string]string{
		"HOME": "/h", "XDG_CACHE_HOME": "/x",
		"PASEO_HOSTS_DIR": "/d", "PASEO_HOSTS_CLIENT": "laptop", "PASEO_HOSTS_VERSION": "0.15.0",
		"PASEO_HOSTS_LISTEN_PORT": "6867", "PASEO_HOSTS_SERVE_PORT": "9000",
		"PASEO_HOSTS_CACHE": "/c", "PASEO_HOSTS_CLIENT_KEY": "id_other",
	}
	c, err := config.Load(env(vars), config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{Dir: "/d", Client: "laptop", Version: "0.15.0", ListenPort: 6867, ServePort: 9000, Cache: "/c", ClientKey: "id_other"}
	if c != want {
		t.Fatalf("got %+v\nwant %+v", c, want)
	}
	c, err = config.Load(env(vars), config.Flags{Client: "desk", ListenPort: 7000, ServePort: 9100})
	if err != nil || c.Client != "desk" || c.ListenPort != 7000 || c.ServePort != 9100 {
		t.Fatalf("flags must override variables: %+v %v", c, err)
	}
	vars["PASEO_HOSTS_LISTEN_PORT"] = "port"
	if _, err := config.Load(env(vars), config.Flags{}); report.Code(err) != report.ExitConfig {
		t.Fatalf("a bad port must exit 3, got %v", err)
	}
}

func TestLinkWithoutClientNamesTheVariable(t *testing.T) {
	c, err := config.Load(env(map[string]string{"HOME": "/h"}), config.Flags{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.RequireClient()
	var re *report.Error
	if !errors.As(err, &re) || re.Code != report.ExitConfig || !strings.Contains(re.Msg, "PASEO_HOSTS_CLIENT") {
		t.Fatalf("want exit 3 naming PASEO_HOSTS_CLIENT, got %v", err)
	}
}
