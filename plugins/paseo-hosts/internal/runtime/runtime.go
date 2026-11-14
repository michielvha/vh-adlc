// Package runtime installs the pinned Paseo CLI on the operator host and
// calls its password hashing.
package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/michielvha/logger"
	"github.com/michielvha/vh-adlc/plugins/paseo-hosts/internal/report"
)

// Runtime is one installed @getpaseo/cli version under the cache.
type Runtime struct {
	Dir     string
	Version string
}

// Require checks that node and npm are on PATH and exits 3 naming the
// missing one.
func Require() error {
	for _, tool := range []string{"node", "npm"} {
		if _, err := exec.LookPath(tool); err != nil {
			return report.Errorf(report.ExitConfig, "%s is not on PATH; the operator host needs Node and npm for the local Paseo runtime", tool)
		}
	}
	return nil
}

// Ensure returns the runtime for version, installing it into
// <cache>/runtime/<version>/ with npm the first time.
func Ensure(ctx context.Context, cache, version string) (*Runtime, error) {
	if err := Require(); err != nil {
		return nil, err
	}
	r := &Runtime{Dir: filepath.Join(cache, "runtime", version), Version: version}
	if r.installed() {
		return r, nil
	}
	if err := os.MkdirAll(r.Dir, 0o700); err != nil {
		return nil, err
	}
	logger.Debug("installing the local Paseo runtime", "dir", r.Dir, "version", version)
	cmd := exec.CommandContext(ctx, "npm", "install", "--silent", "--no-fund", "--no-audit", "--prefix", r.Dir, "--save-exact", "@getpaseo/cli@"+version)
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("npm install @getpaseo/cli@%s: %v: %s", version, err, strings.TrimSpace(string(out)))
	}
	if !r.installed() {
		return nil, fmt.Errorf("npm did not install @getpaseo/cli@%s into %s", version, r.Dir)
	}
	return r, nil
}

func (r *Runtime) installed() bool {
	data, err := os.ReadFile(filepath.Join(r.Dir, "node_modules", "@getpaseo", "cli", "package.json"))
	if err != nil {
		return false
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(data, &pkg) != nil || pkg.Version != r.Version {
		return false
	}
	_, err = os.Stat(r.Paseo())
	return err == nil
}

// Paseo returns the path of the runtime's paseo command.
func (r *Runtime) Paseo() string {
	return filepath.Join(r.Dir, "node_modules", ".bin", "paseo")
}

const hashScript = `import { hashDaemonPassword } from "@getpaseo/server/auth";
let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(await hashDaemonPassword(input));`

// Hash returns hashDaemonPassword(password). The password reaches node on
// standard input only.
func (r *Runtime) Hash(ctx context.Context, password string) (string, error) {
	cmd := exec.CommandContext(ctx, "node", "--input-type=module", "-e", hashScript)
	cmd.Dir = r.Dir
	cmd.Stdin = strings.NewReader(password)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("hash the password with the local runtime: %v: %s", err, strings.TrimSpace(stderr.String()))
	}
	hash := string(out)
	if !strings.HasPrefix(hash, "$2") || strings.ContainsAny(hash, " \n'\"") {
		return "", errors.New("hashDaemonPassword returned an unexpected format")
	}
	return hash, nil
}
