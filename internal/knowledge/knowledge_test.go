package knowledge

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/testrepo"
)

const (
	pluginPin = "1111111111111111111111111111111111111111"
	repoPin   = "2222222222222222222222222222222222222222"
	otherPin  = "3333333333333333333333333333333333333333"
)

var requestPath = regexp.MustCompile(`^/vhco-pro/docs/[0-9a-f]{40}/[^.][^\s]*$`)

// docsServer serves the standard for every SHA, and any page in extra.
type docsServer struct {
	*httptest.Server
	mu       sync.Mutex
	requests []string
}

func newDocsServer(t *testing.T, extra map[string]string) *docsServer {
	t.Helper()
	d := &docsServer{}
	d.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		d.mu.Lock()
		d.requests = append(d.requests, r.URL.Path)
		d.mu.Unlock()
		parts := strings.SplitN(r.URL.Path, "/", 5)
		if len(parts) < 5 {
			http.NotFound(w, r)
			return
		}
		page := parts[4]
		switch {
		case page == "conventions/feature-documents.md":
			_, _ = w.Write([]byte(testrepo.Standard()))
		case extra[page] != "":
			_, _ = w.Write([]byte(extra[page]))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(d.Close)
	old := BaseURL
	BaseURL = d.URL
	t.Cleanup(func() { BaseURL = old })
	return d
}

func (d *docsServer) count() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.requests)
}

func (d *docsServer) checkPaths(t *testing.T) {
	t.Helper()
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, p := range d.requests {
		if !requestPath.MatchString(p) {
			t.Errorf("request path %q is not /vhco-pro/docs/<sha>/<page>", p)
		}
	}
}

func link(sha string) string {
	return "See https://github.com/vhco-pro/docs/blob/" + sha + "/README.md for conventions.\n"
}

func resolve(t *testing.T, repo *testrepo.Repo, o Options) (*Resolved, report.Result, []report.Finding) {
	t.Helper()
	o.Repo = repo.Dir
	if o.PluginPin == "" {
		o.PluginPin = pluginPin
	}
	if o.CacheDir == "" {
		o.CacheDir = t.TempDir()
	}
	return Resolve(t.Context(), o)
}

func codes(fs []report.Finding) []string {
	var out []string
	for _, f := range fs {
		out = append(out, f.Code)
	}
	return out
}

func TestPins(t *testing.T) {
	tests := []struct {
		name     string
		files    map[string]string
		result   report.Result
		source   string
		revision string
		pinFiles []string
	}{
		{"no pin", nil, report.Answered, "plugin", pluginPin, nil},
		{"repository pin", map[string]string{"AGENTS.md": link(repoPin)}, report.Answered, "repository", repoPin, []string{"AGENTS.md"}},
		{"pin in two bridges", map[string]string{"AGENTS.md": link(repoPin), "CLAUDE.md": link(repoPin)}, report.Answered, "repository", repoPin, []string{"AGENTS.md", "CLAUDE.md"}},
		{"copilot bridge", map[string]string{".github/copilot-instructions.md": link(repoPin)}, report.Answered, "repository", repoPin, []string{".github/copilot-instructions.md"}},
		{"short SHA", map[string]string{"AGENTS.md": link("2222222")}, report.InvalidPin, "", "", nil},
		{"branch name", map[string]string{"AGENTS.md": link("main")}, report.InvalidPin, "", "", nil},
		{"two SHAs", map[string]string{"AGENTS.md": link(repoPin), "CLAUDE.md": link(otherPin)}, report.InvalidPin, "", "", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newDocsServer(t, nil)
			repo := testrepo.New(t)
			for p, c := range tt.files {
				repo.Write(p, c)
			}
			got, result, findings := resolve(t, repo, Options{})
			if result != tt.result {
				t.Fatalf("result = %q, want %q; findings %+v", result, tt.result, findings)
			}
			if result == report.InvalidPin {
				if !slices.Equal(codes(findings), []string{report.CodeInvalidPin}) {
					t.Fatalf("findings = %+v", findings)
				}
				if srv.count() != 0 {
					t.Fatalf("an invalid pin made %d requests", srv.count())
				}
				return
			}
			if got.Source != tt.source || got.Revision != tt.revision || !slices.Equal(got.PinFiles, tt.pinFiles) {
				t.Fatalf("knowledge = %+v", got.Knowledge)
			}
			if got.Rules == nil || got.RulesSchema != 1 || got.FeatureRoot != "docs/internal/plans" {
				t.Fatalf("rules not loaded: %+v", got.Knowledge)
			}
			srv.checkPaths(t)
		})
	}
}

func TestPagesAndCache(t *testing.T) {
	srv := newDocsServer(t, map[string]string{"conventions/go.md": "# Go\n"})
	repo := testrepo.New(t)
	cache := t.TempDir()

	got, result, findings := resolve(t, repo, Options{CacheDir: cache, Pages: []string{"conventions/go.md"}})
	if result != report.Answered {
		t.Fatalf("result = %q, findings %+v", result, findings)
	}
	if string(got.Pages["conventions/go.md"]) != "# Go\n" {
		t.Fatalf("page = %q", got.Pages["conventions/go.md"])
	}
	before := srv.count()

	_, result, _ = resolve(t, repo, Options{CacheDir: cache, Pages: []string{"conventions/go.md"}, Offline: true})
	if result != report.Answered || srv.count() != before {
		t.Fatalf("warm offline run: result %q, %d new requests", result, srv.count()-before)
	}

	_, result, findings = resolve(t, repo, Options{CacheDir: t.TempDir(), Offline: true})
	if result != report.Unreachable || !slices.Contains(codes(findings), report.CodeUnreachable) {
		t.Fatalf("cold offline run: result %q, findings %+v", result, findings)
	}

	_, result, findings = resolve(t, repo, Options{Pages: []string{"guides/absent.md", "conventions/go.md"}})
	if result != report.MissingPage || len(findings) != 1 || findings[0].Path != "guides/absent.md" {
		t.Fatalf("missing page: result %q, findings %+v", result, findings)
	}
	srv.checkPaths(t)
}

func TestUnreachable(t *testing.T) {
	srv := newDocsServer(t, nil)
	srv.Close()
	repo := testrepo.New(t)
	_, result, findings := resolve(t, repo, Options{})
	if result != report.Unreachable || !slices.Equal(codes(findings), []string{report.CodeUnreachable}) {
		t.Fatalf("result %q, findings %+v", result, findings)
	}
}

func TestBadPage(t *testing.T) {
	newDocsServer(t, nil)
	repo := testrepo.New(t)
	for _, page := range []string{"../secrets.md", "/etc/passwd", "a/../../b.md", ""} {
		_, result, _ := resolve(t, repo, Options{Pages: []string{page}})
		if result != report.Usage {
			t.Errorf("page %q: result %q, want usage", page, result)
		}
	}
}

func TestDocsSource(t *testing.T) {
	srv := newDocsServer(t, nil)
	b := strings.Replace(testrepo.Standard(), "default: docs/internal/plans", "default: plans", 1)
	dir, shas := testrepo.DocsRepo(t,
		map[string]string{"conventions/feature-documents.md": testrepo.Standard()},
		map[string]string{"conventions/feature-documents.md": b},
	)
	repo := testrepo.New(t)
	for i, want := range []string{"docs/internal/plans", "plans"} {
		got, result, findings := resolve(t, repo, Options{PluginPin: shas[i], DocsSource: dir})
		if result != report.Answered {
			t.Fatalf("revision %d: result %q, findings %+v", i, result, findings)
		}
		if !got.Override || got.Revision != shas[i] || got.FeatureRoot != want {
			t.Fatalf("revision %d: knowledge %+v", i, got.Knowledge)
		}
	}
	_, result, findings := resolve(t, repo, Options{PluginPin: shas[0], DocsSource: dir, Pages: []string{"guides/absent.md"}})
	if result != report.MissingPage {
		t.Fatalf("missing page from source: result %q, findings %+v", result, findings)
	}
	if srv.count() != 0 {
		t.Fatalf("--docs-source made %d network requests", srv.count())
	}
}

func TestRepositoryDeclarations(t *testing.T) {
	newDocsServer(t, nil)
	repo := testrepo.New(t)
	repo.Write("AGENTS.md", "# Agents\n\nFeature documents: `docs/specs/`\n")
	got, result, _ := resolve(t, repo, Options{})
	if result != report.Answered || got.FeatureRoot != "docs/specs/" || got.LocalFormat {
		t.Fatalf("declared root: result %q, knowledge %+v", result, got.Knowledge)
	}
	repo.Write("AGENTS.md", "# Agents\n\nFeature document format: local\n")
	got, result, _ = resolve(t, repo, Options{})
	if result != report.Answered || !got.LocalFormat {
		t.Fatalf("local format: result %q, knowledge %+v", result, got.Knowledge)
	}
}

func TestRulesProblem(t *testing.T) {
	broken := strings.Replace(testrepo.Standard(), "schema: 1\n", "schema: 9\n", 1)
	dir, shas := testrepo.DocsRepo(t, map[string]string{"conventions/feature-documents.md": broken})
	repo := testrepo.New(t)
	_, result, findings := resolve(t, repo, Options{PluginPin: shas[0], DocsSource: dir})
	if result != report.Malformed || !slices.Equal(codes(findings), []string{report.CodeRulesSchemaUnknown}) {
		t.Fatalf("result %q, findings %+v", result, findings)
	}
}
