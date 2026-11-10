// Package registry reads and writes the <alias>.env and <alias>.password files
// in PASEO_HOSTS_DIR. It parses KEY=value lines and never runs a file.
package registry

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

// Entry is one server's registry file.
type Entry struct {
	Alias        string
	SSH          string
	User         string
	DNS          string
	ListenPort   int
	Published    bool
	ServePort    int
	URL          string
	Version      string
	Agents       string
	PasswordFile string
	Unit         string
	Clients      []string
	ClientHost   string
	ClientPort   int
	extra        map[string]string
}

var (
	lineRE  = regexp.MustCompile(`^([A-Z][A-Z0-9_]*)=(?:"([^"$` + "`" + `\\]*)"|([^\s"'$` + "`" + `\\;&|<>()]*))$`)
	quoteRE = regexp.MustCompile(`[\s"'$` + "`" + `\\;&|<>()]`)
	aliasRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
)

var knownKeys = []string{
	"PASEO_SSH", "PASEO_USER", "PASEO_DNS", "PASEO_LISTEN_PORT", "PASEO_PUBLISHED", "PASEO_SERVE_PORT",
	"PASEO_URL", "PASEO_VERSION", "PASEO_AGENTS", "PASEO_PASSWORD_FILE", "PASEO_UNIT",
	"PASEO_CLIENTS", "PASEO_CLIENT_HOST", "PASEO_CLIENT_PORT",
}

// ValidAlias reports whether alias can name registry files and SSH aliases.
func ValidAlias(alias string) bool { return aliasRE.MatchString(alias) }

// EnvPath returns the registry file path for alias.
func EnvPath(dir, alias string) string { return filepath.Join(dir, alias+".env") }

// PasswordPath returns the password file path for alias.
func PasswordPath(dir, alias string) string { return filepath.Join(dir, alias+".password") }

// Parse reads registry data. Missing PASEO_PUBLISHED means no, missing
// PASEO_CLIENTS means none, and missing PASEO_CLIENT_HOST and
// PASEO_CLIENT_PORT mean PASEO_DNS and 22.
func Parse(alias string, data []byte) (*Entry, error) {
	values := map[string]string{}
	for i, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		m := lineRE.FindStringSubmatch(line)
		if m == nil {
			return nil, fmt.Errorf("line %d is not KEY=value", i+1)
		}
		values[m[1]] = m[2] + m[3]
	}
	e := &Entry{Alias: alias, extra: map[string]string{}}
	var err error
	num := func(key string, def int) int {
		v, ok := values[key]
		if !ok || v == "" {
			return def
		}
		n, convErr := strconv.Atoi(v)
		if convErr != nil || n < 1 || n > 65535 {
			err = errors.Join(err, fmt.Errorf("%s is not a port: %q", key, v))
		}
		return n
	}
	e.SSH = values["PASEO_SSH"]
	e.User = values["PASEO_USER"]
	e.DNS = values["PASEO_DNS"]
	e.ListenPort = num("PASEO_LISTEN_PORT", 0)
	e.Published = values["PASEO_PUBLISHED"] == "yes"
	e.ServePort = num("PASEO_SERVE_PORT", 0)
	e.URL = values["PASEO_URL"]
	e.Version = values["PASEO_VERSION"]
	e.Agents = values["PASEO_AGENTS"]
	e.PasswordFile = values["PASEO_PASSWORD_FILE"]
	e.Unit = values["PASEO_UNIT"]
	for _, c := range strings.Split(values["PASEO_CLIENTS"], ",") {
		if c = strings.TrimSpace(c); c != "" {
			e.AddClient(c)
		}
	}
	e.ClientHost = values["PASEO_CLIENT_HOST"]
	if _, ok := values["PASEO_CLIENT_HOST"]; !ok {
		e.ClientHost = e.DNS
	}
	e.ClientPort = num("PASEO_CLIENT_PORT", 22)
	for k, v := range values {
		if !slices.Contains(knownKeys, k) {
			e.extra[k] = v
		}
	}
	if e.SSH == "" {
		err = errors.Join(err, errors.New("PASEO_SSH is missing"))
	}
	if e.ListenPort == 0 {
		err = errors.Join(err, errors.New("PASEO_LISTEN_PORT is missing"))
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

// Load reads <alias>.env from dir. A missing file exits 3.
func Load(dir, alias string) (*Entry, error) {
	if !ValidAlias(alias) {
		return nil, report.Errorf(report.ExitUsage, "invalid server alias %q", alias)
	}
	path := EnvPath(dir, alias)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, report.Errorf(report.ExitConfig, "no registry entry %s (run: paseo-hosts onboard %s)", path, alias)
	}
	if err != nil {
		return nil, err
	}
	e, err := Parse(alias, data)
	if err != nil {
		return nil, report.Errorf(report.ExitConfig, "registry file %s: %v", path, err)
	}
	return e, nil
}

// List loads every registry file in dir, sorted by alias.
func List(dir string) ([]*Entry, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.env"))
	if err != nil {
		return nil, err
	}
	slices.Sort(paths)
	var entries []*Entry
	for _, p := range paths {
		e, err := Load(dir, strings.TrimSuffix(filepath.Base(p), ".env"))
		if err != nil {
			return entries, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// AddClient records client once.
func (e *Entry) AddClient(client string) {
	if !slices.Contains(e.Clients, client) {
		e.Clients = append(e.Clients, client)
	}
}

// RemoveClient drops client.
func (e *Entry) RemoveClient(client string) {
	e.Clients = slices.DeleteFunc(e.Clients, func(c string) bool { return c == client })
}

// HasClient reports whether client is recorded.
func (e *Entry) HasClient(client string) bool { return slices.Contains(e.Clients, client) }

// Save writes <alias>.env with mode 600 in dir, which gets mode 700.
func (e *Entry) Save(dir string) error {
	if err := EnsureDir(dir); err != nil {
		return err
	}
	published := "no"
	if e.Published {
		published = "yes"
	}
	port := func(n int) string {
		if n == 0 {
			return ""
		}
		return strconv.Itoa(n)
	}
	values := map[string]string{
		"PASEO_SSH": e.SSH, "PASEO_USER": e.User, "PASEO_DNS": e.DNS,
		"PASEO_LISTEN_PORT": port(e.ListenPort), "PASEO_PUBLISHED": published, "PASEO_SERVE_PORT": port(e.ServePort),
		"PASEO_URL": e.URL, "PASEO_VERSION": e.Version, "PASEO_AGENTS": e.Agents,
		"PASEO_PASSWORD_FILE": e.PasswordFile, "PASEO_UNIT": e.Unit,
		"PASEO_CLIENTS": strings.Join(e.Clients, ","), "PASEO_CLIENT_HOST": e.ClientHost, "PASEO_CLIENT_PORT": port(e.ClientPort),
	}
	keys := slices.Clone(knownKeys)
	var extra []string
	for k, v := range e.extra {
		values[k] = v
		extra = append(extra, k)
	}
	slices.Sort(extra)
	keys = append(keys, extra...)
	var buf bytes.Buffer
	for _, k := range keys {
		v := values[k]
		if strings.ContainsAny(v, "\"$`\\\n") {
			return fmt.Errorf("registry value for %s cannot be stored: %q", k, v)
		}
		if quoteRE.MatchString(v) {
			v = `"` + v + `"`
		}
		fmt.Fprintf(&buf, "%s=%s\n", k, v)
	}
	return writeFile(EnvPath(dir, e.Alias), buf.Bytes())
}

// EnsureDir creates dir with mode 700.
func EnsureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.Chmod(dir, 0o700)
}

func writeFile(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// ReadPassword returns the stored password for alias.
func ReadPassword(dir, alias string) (string, error) {
	data, err := os.ReadFile(PasswordPath(dir, alias))
	if errors.Is(err, os.ErrNotExist) {
		return "", report.Errorf(report.ExitConfig, "no password file %s (run: paseo-hosts onboard %s)", PasswordPath(dir, alias), alias)
	}
	if err != nil {
		return "", err
	}
	pw := strings.TrimSpace(string(data))
	if pw == "" {
		return "", report.Errorf(report.ExitConfig, "password file %s is empty", PasswordPath(dir, alias))
	}
	return pw, nil
}

// EnsurePassword reuses the stored password for alias or creates one with
// mode 600. It reports whether it created the file.
func EnsurePassword(dir, alias string) (string, bool, error) {
	if err := EnsureDir(dir); err != nil {
		return "", false, err
	}
	path := PasswordPath(dir, alias)
	if info, err := os.Stat(path); err == nil && info.Size() > 0 {
		if err := os.Chmod(path, 0o600); err != nil {
			return "", false, err
		}
		pw, err := ReadPassword(dir, alias)
		return pw, false, err
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", false, err
	}
	pw := base64.RawURLEncoding.EncodeToString(raw)
	if err := writeFile(path, []byte(pw+"\n")); err != nil {
		return "", false, err
	}
	return pw, true, nil
}

// Delete removes the registry and password files for alias.
func Delete(dir, alias string) error {
	for _, p := range []string{EnvPath(dir, alias), PasswordPath(dir, alias)} {
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}
