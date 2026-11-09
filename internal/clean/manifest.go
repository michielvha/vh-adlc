// Package clean implements `vh-adlc env` and `vh-adlc clean`: a project's temp
// root, and the removal of what its killed runs left behind, limited to what
// its default-branch manifest declares and the binary's built-in Go globs.
package clean

import (
	"bytes"
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/settings"
	"go.yaml.in/yaml/v4"
)

// ManifestPath is where a repository declares what it owns.
const ManifestPath = ".vh-adlc/cleanup.yaml"

// The two liveness kinds.
const (
	LivenessPID  = "pid"
	LivenessPath = "path"
)

// minAge is the shortest age a manifest may give.
const minAge = time.Hour

// minLiterals is how many literal characters a glob needs before its first
// wildcard.
const minLiterals = 4

// Manifest is a decoded, validated `.vh-adlc/cleanup.yaml`.
type Manifest struct {
	Project  string
	TempRoot *TempRootRule
	Tmp      []TmpRule
	Compose  []ComposeRule
	Kind     []KindRule
}

// TempRootRule ages the entries inside the project's temp root.
type TempRootRule struct{ MaxAge time.Duration }

// TmpRule matches top-level /tmp names.
type TmpRule struct {
	Glob   string
	MaxAge time.Duration
}

// ComposeRule matches Compose project names.
type ComposeRule struct {
	Project string
	Volumes bool
}

// KindRule matches kind cluster names and names the label of their marks.
type KindRule struct {
	Cluster  string
	Liveness Liveness
}

// Liveness says how a mark's label is read.
type Liveness struct {
	Kind  string
	Label string
}

// The file's shape. Pointers tell a missing value from a zero one.
type rawManifest struct {
	SchemaVersion *int          `yaml:"schema_version"`
	Project       *string       `yaml:"project"`
	TempRoot      *rawAge       `yaml:"temp_root"`
	Tmp           []rawTmp      `yaml:"tmp"`
	Compose       []rawCompose  `yaml:"compose"`
	Kind          []rawKindRule `yaml:"kind"`
}

type rawAge struct {
	MaxAge *string `yaml:"max_age"`
}

type rawTmp struct {
	Glob   *string `yaml:"glob"`
	MaxAge *string `yaml:"max_age"`
}

type rawCompose struct {
	Project *string    `yaml:"project"`
	Volumes strictBool `yaml:"volumes"`
}

type rawKindRule struct {
	Cluster  *string      `yaml:"cluster"`
	Liveness *rawLiveness `yaml:"liveness"`
}

type rawLiveness struct {
	Kind  *string `yaml:"kind"`
	Label *string `yaml:"label"`
}

// plainSegment is the one shape a project name may take.
var plainSegment = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// ParseManifest decodes and checks a manifest. Every refusal is an error
// whose text starts with "manifest: ".
func ParseManifest(b []byte) (*Manifest, error) {
	var raw rawManifest
	if err := decodeStrict(b, &raw); err != nil {
		return nil, fmt.Errorf("manifest: %w", err)
	}
	m, err := raw.check()
	if err != nil {
		return nil, fmt.Errorf("manifest: %w", err)
	}
	return m, nil
}

func (raw *rawManifest) check() (*Manifest, error) {
	if raw.SchemaVersion == nil || *raw.SchemaVersion != 1 {
		return nil, errors.New("schema_version must be 1")
	}
	if raw.Project == nil {
		return nil, errors.New("project is missing")
	}
	if !plainPathSegment(*raw.Project) {
		return nil, errors.New("project is not one plain path segment")
	}
	m := &Manifest{Project: *raw.Project}
	if raw.TempRoot != nil {
		age, err := checkAge("temp_root.max_age", raw.TempRoot.MaxAge)
		if err != nil {
			return nil, err
		}
		m.TempRoot = &TempRootRule{MaxAge: age}
	}
	for i, r := range raw.Tmp {
		where := fmt.Sprintf("tmp[%d]", i)
		glob, err := checkGlob(where+".glob", r.Glob)
		if err != nil {
			return nil, err
		}
		age, err := checkAge(where+".max_age", r.MaxAge)
		if err != nil {
			return nil, err
		}
		m.Tmp = append(m.Tmp, TmpRule{Glob: glob, MaxAge: age})
	}
	for i, r := range raw.Compose {
		glob, err := checkGlob(fmt.Sprintf("compose[%d].project", i), r.Project)
		if err != nil {
			return nil, err
		}
		m.Compose = append(m.Compose, ComposeRule{Project: glob, Volumes: bool(r.Volumes)})
	}
	for i, r := range raw.Kind {
		where := fmt.Sprintf("kind[%d]", i)
		glob, err := checkGlob(where+".cluster", r.Cluster)
		if err != nil {
			return nil, err
		}
		if r.Liveness == nil {
			return nil, fmt.Errorf("%s has no liveness", where)
		}
		kind := ""
		if r.Liveness.Kind != nil {
			kind = *r.Liveness.Kind
		}
		if kind != LivenessPID && kind != LivenessPath {
			return nil, fmt.Errorf("%s.liveness.kind must be pid or path", where)
		}
		if r.Liveness.Label == nil || strings.TrimSpace(*r.Liveness.Label) == "" || strings.ContainsAny(*r.Liveness.Label, "= \t") {
			return nil, fmt.Errorf("%s.liveness.label must be a label key", where)
		}
		m.Kind = append(m.Kind, KindRule{Cluster: glob, Liveness: Liveness{Kind: kind, Label: *r.Liveness.Label}})
	}
	return m, nil
}

// strictBool takes only true and false. The library would also read a
// string such as yes into a bool field, which the strict reader leaves as a
// string.
type strictBool bool

func (b *strictBool) UnmarshalYAML(n *yaml.Node) error {
	if n.Kind != yaml.ScalarNode || n.Tag != "!!bool" {
		return errors.New("not a boolean")
	}
	var v bool
	if err := n.Decode(&v); err != nil {
		return err
	}
	*b = strictBool(v)
	return nil
}

func plainPathSegment(s string) bool {
	return s != "." && s != ".." && plainSegment.MatchString(s)
}

// checkGlob applies the literal floor to every glob, including a name with no
// wildcard, and refuses a separator or a pattern path.Match cannot read.
func checkGlob(where string, glob *string) (string, error) {
	if glob == nil {
		return "", fmt.Errorf("%s is missing", where)
	}
	g := *glob
	if strings.ContainsAny(g, `/\`) {
		return "", fmt.Errorf("%s holds a path separator", where)
	}
	literal := len(g)
	if i := strings.IndexAny(g, `*?[`); i >= 0 {
		literal = i
	}
	if literal < minLiterals {
		return "", fmt.Errorf("%s has fewer than %d literal characters before its first wildcard", where, minLiterals)
	}
	if _, err := path.Match(g, ""); err != nil {
		return "", fmt.Errorf("%s is not a valid glob", where)
	}
	return g, nil
}

func checkAge(where string, age *string) (time.Duration, error) {
	if age == nil {
		return 0, fmt.Errorf("%s is missing", where)
	}
	d, err := time.ParseDuration(*age)
	if err != nil {
		return 0, fmt.Errorf("%s is not a duration", where)
	}
	if d < minAge {
		return 0, fmt.Errorf("%s is under one hour", where)
	}
	return d, nil
}

// decodeStrict runs a settings file through the repository's strict reader,
// which refuses anchors, aliases, merge keys, tags, a second document and
// loose number and boolean spellings, and then decodes it into out with
// unknown keys refused.
func decodeStrict(b []byte, out any) error {
	rep := settings.Command(bytes.NewReader(b))
	if rep.Result != report.Answered {
		reason := "unreadable"
		line := 0
		if len(rep.Findings) > 0 {
			reason, line = rep.Findings[0].Message, rep.Findings[0].Line
		}
		if line > 0 {
			return fmt.Errorf("line %d: %s", line, reason)
		}
		return errors.New(reason)
	}
	dec := yaml.NewDecoder(bytes.NewReader(b))
	dec.KnownFields(true)
	if err := dec.Decode(out); err != nil {
		return errors.New("an unknown key or a value of the wrong type")
	}
	return nil
}
