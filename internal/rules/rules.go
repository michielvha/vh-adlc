// Package rules reads the machine-checked rules block from the
// feature-document standard. Every status, transition, section, ID, column,
// record and verdict rule the binary applies comes from this block; the
// package itself only knows the schema-1 shape of the block.
package rules

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/michielvha/vh-adlc/internal/report"
	"go.yaml.in/yaml/v3"
)

// InfoString is the fenced-block info string that marks the rules block.
const InfoString = "yaml vh-adlc-rules"

// Schema-1 vocabulary: the values of the block's lists that carry meaning
// for the binary, in addition to the condition names in report.Conditions.
const (
	KindSpec           = "spec"
	KindImplementation = "implementation"
	SeverityBlocking   = "blocking"
	VerdictMet         = "met"
)

// Error is a rules-block problem; Code is its finding code.
type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func errorf(code, format string, a ...any) *Error {
	return &Error{Code: code, Message: fmt.Sprintf(format, a...)}
}

// StringList is a YAML scalar or sequence of strings.
type StringList []string

// UnmarshalYAML accepts either one string or a list of strings.
func (s *StringList) UnmarshalYAML(n *yaml.Node) error {
	if n.Kind == yaml.ScalarNode {
		*s = StringList{n.Value}
		return nil
	}
	var list []string
	if err := n.Decode(&list); err != nil {
		return err
	}
	*s = list
	return nil
}

// NextRule is one entry of the block's next list.
type NextRule struct {
	Status StringList `yaml:"status"`
	When   string     `yaml:"when"`
	Do     string     `yaml:"do"`
}

// Condition returns the condition the rule's when names and whether it is
// negated. An empty name means the rule has no when.
func (n NextRule) Condition() (name string, negated bool) {
	w := strings.TrimSpace(n.When)
	if rest, ok := strings.CutPrefix(w, "not "); ok {
		return strings.TrimSpace(rest), true
	}
	return w, false
}

// Rules is the parsed schema-1 rules block.
type Rules struct {
	Schema      int                 `yaml:"schema"`
	Statuses    []string            `yaml:"statuses"`
	Transitions map[string][]string `yaml:"transitions"`
	FeatureRoot struct {
		Default     string `yaml:"default"`
		Declaration string `yaml:"declaration"`
	} `yaml:"feature_root"`
	RequiredFrontmatter     []string            `yaml:"required_frontmatter"`
	RequiredFrontmatterFrom map[string][]string `yaml:"required_frontmatter_from"`
	RequiredSections        []string            `yaml:"required_sections"`
	NormativeSections       []string            `yaml:"normative_sections"`
	NormativeFrontmatter    []string            `yaml:"normative_frontmatter"`
	IDs                     struct {
		Criterion string `yaml:"criterion"`
		Task      string `yaml:"task"`
		Review    string `yaml:"review"`
	} `yaml:"ids"`
	CriterionLine string `yaml:"criterion_line"`
	TaskLine      string `yaml:"task_line"`
	EvidenceLine  string `yaml:"evidence_line"`
	ResidualLine  string `yaml:"residual_line"`
	OpenQuestion  string `yaml:"open_question"`
	TestPlan      struct {
		Columns       []string `yaml:"columns"`
		CriterionCell string   `yaml:"criterion_cell"`
	} `yaml:"test_plan"`
	ReviewLogColumns []string `yaml:"review_log_columns"`
	ReviewCommit     string   `yaml:"review_commit"`
	ReviewKinds      []string `yaml:"review_kinds"`
	Isolation        []string `yaml:"isolation"`
	AcceptanceRow    struct {
		Kind       string `yaml:"kind"`
		Model      string `yaml:"model"`
		Isolation  string `yaml:"isolation"`
		Outcome    string `yaml:"outcome"`
		Subsection bool   `yaml:"subsection"`
	} `yaml:"acceptance_row"`
	Verdicts               []string            `yaml:"verdicts"`
	RecordCriterion        string              `yaml:"record_criterion"`
	CriterionContinuation  string              `yaml:"criterion_continuation"`
	RecordVerdict          string              `yaml:"record_verdict"`
	RecordFinding          string              `yaml:"record_finding"`
	RecordSeverity         string              `yaml:"record_severity"`
	RecordNoFindings       string              `yaml:"record_no_findings"`
	LocalFormatDeclaration string              `yaml:"local_format_declaration"`
	Gates                  map[string][]string `yaml:"gates"`
	Next                   []NextRule          `yaml:"next"`

	// Re holds the compiled patterns.
	Re Patterns `yaml:"-"`
}

// Patterns are the block's compiled regular expressions.
type Patterns struct {
	CriterionID, TaskID, ReviewID                   *regexp.Regexp
	Declaration, LocalFormat                        *regexp.Regexp
	CriterionLine, TaskLine, Evidence, Residual     *regexp.Regexp
	OpenQuestion, CriterionCell, ReviewCommit       *regexp.Regexp
	RecordCriterion, Continuation, RecordVerdict    *regexp.Regexp
	RecordFinding, RecordSeverity, RecordNoFindings *regexp.Regexp
}

var blockRe = regexp.MustCompile("(?m)^```" + regexp.QuoteMeta(InfoString) + "[ \t]*\r?\n([\\s\\S]*?)^```[ \t]*$")

// Parse finds the one rules block on the standard page and parses it.
func Parse(page []byte) (*Rules, error) {
	blocks := blockRe.FindAllSubmatch(page, -1)
	switch len(blocks) {
	case 0:
		return nil, errorf(report.CodeRulesBlockMissing, "the standard has no fenced block with info string %q", InfoString)
	case 1:
	default:
		return nil, errorf(report.CodeRulesBlockAmbiguous, "the standard has %d fenced blocks with info string %q", len(blocks), InfoString)
	}
	body := blocks[0][1]
	var root yaml.Node
	if err := yaml.Unmarshal(body, &root); err != nil {
		return nil, errorf(report.CodeRulesBlockMissing, "the rules block is not YAML: %v", err)
	}
	var r Rules
	if err := root.Decode(&r); err != nil {
		return nil, errorf(report.CodeRulesBlockMissing, "the rules block does not have the schema-1 shape: %v", err)
	}
	if r.Schema != 1 {
		return nil, errorf(report.CodeRulesSchemaUnknown, "rules schema %d is unknown; this binary reads schema 1", r.Schema)
	}
	if err := checkAllPatterns(&root); err != nil {
		return nil, err
	}
	if err := r.compile(); err != nil {
		return nil, err
	}
	if err := r.checkConditions(); err != nil {
		return nil, err
	}
	return &r, nil
}

// checkAllPatterns compiles every string in the block that starts with ^.
func checkAllPatterns(n *yaml.Node) error {
	if n.Kind == yaml.ScalarNode && strings.HasPrefix(n.Value, "^") {
		if _, err := regexp.Compile(n.Value); err != nil {
			return errorf(report.CodeRulesPatternInvalid, "pattern %q does not compile: %v", n.Value, err)
		}
	}
	for _, c := range n.Content {
		if err := checkAllPatterns(c); err != nil {
			return err
		}
	}
	return nil
}

func (r *Rules) compile() error {
	specs := []struct {
		name    string
		pattern string
		groups  int
		dst     **regexp.Regexp
	}{
		{"ids.criterion", r.IDs.Criterion, 0, &r.Re.CriterionID},
		{"ids.task", r.IDs.Task, 0, &r.Re.TaskID},
		{"ids.review", r.IDs.Review, 0, &r.Re.ReviewID},
		{"feature_root.declaration", r.FeatureRoot.Declaration, 1, &r.Re.Declaration},
		{"local_format_declaration", r.LocalFormatDeclaration, 0, &r.Re.LocalFormat},
		{"criterion_line", r.CriterionLine, 2, &r.Re.CriterionLine},
		{"task_line", r.TaskLine, 2, &r.Re.TaskLine},
		{"evidence_line", r.EvidenceLine, 0, &r.Re.Evidence},
		{"residual_line", r.ResidualLine, 1, &r.Re.Residual},
		{"open_question", r.OpenQuestion, 0, &r.Re.OpenQuestion},
		{"test_plan.criterion_cell", r.TestPlan.CriterionCell, 0, &r.Re.CriterionCell},
		{"review_commit", r.ReviewCommit, 0, &r.Re.ReviewCommit},
		{"record_criterion", r.RecordCriterion, 1, &r.Re.RecordCriterion},
		{"criterion_continuation", r.CriterionContinuation, 0, &r.Re.Continuation},
		{"record_verdict", r.RecordVerdict, 1, &r.Re.RecordVerdict},
		{"record_finding", r.RecordFinding, 0, &r.Re.RecordFinding},
		{"record_severity", r.RecordSeverity, 1, &r.Re.RecordSeverity},
		{"record_no_findings", r.RecordNoFindings, 0, &r.Re.RecordNoFindings},
	}
	for _, s := range specs {
		if s.pattern == "" {
			return errorf(report.CodeRulesPatternInvalid, "%s is missing", s.name)
		}
		re, err := regexp.Compile(s.pattern)
		if err != nil {
			return errorf(report.CodeRulesPatternInvalid, "%s %q does not compile: %v", s.name, s.pattern, err)
		}
		if re.NumSubexp() < s.groups {
			return errorf(report.CodeRulesPatternInvalid, "%s %q has %d capture groups; schema 1 reads group %d", s.name, s.pattern, re.NumSubexp(), s.groups)
		}
		*s.dst = re
	}
	return nil
}

func (r *Rules) checkConditions() error {
	known := func(c string) bool { return slices.Contains(report.Conditions, c) }
	for _, target := range sortedKeys(r.Gates) {
		for _, c := range r.Gates[target] {
			if !known(c) {
				return errorf(report.CodeRulesConditionUnknown, "gate %s names unknown condition %q", target, c)
			}
		}
	}
	for i, n := range r.Next {
		if c, _ := n.Condition(); c != "" && !known(c) {
			return errorf(report.CodeRulesConditionUnknown, "next rule %d names unknown condition %q", i+1, c)
		}
		if n.Do == "" {
			return errorf(report.CodeRulesConditionUnknown, "next rule %d has no action", i+1)
		}
	}
	return nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

// Fold folds every run of whitespace to one space and trims the ends.
func Fold(s string) string { return strings.Join(strings.Fields(s), " ") }

// SpecRecords describes the records of one spec-review subsection.
type SpecRecords struct {
	WellFormed bool
	NoFindings bool
	Mixed      bool
	Blocking   bool
	Findings   int
}

// Clean reports whether the records are well formed with no blocking finding.
func (s SpecRecords) Clean() bool { return s.WellFormed && !s.Blocking }

// SpecRecords checks a spec-review subsection: complete finding records
// (each record_finding line followed by exactly one record_severity line
// before the next finding), or exactly one record_no_findings line.
func (r *Rules) SpecRecords(lines []string) SpecRecords {
	var s SpecRecords
	var nonBlank, noFindingLines int
	severities := -1
	complete := true
	closeFinding := func() {
		if severities >= 0 && severities != 1 {
			complete = false
		}
	}
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		nonBlank++
		switch {
		case r.Re.RecordNoFindings.MatchString(l):
			noFindingLines++
		case r.Re.RecordFinding.MatchString(l):
			closeFinding()
			s.Findings++
			severities = 0
		case r.Re.RecordSeverity.MatchString(l):
			if severities < 0 {
				complete = false
				continue
			}
			severities++
			if r.Re.RecordSeverity.FindStringSubmatch(l)[1] == SeverityBlocking {
				s.Blocking = true
			}
		}
	}
	closeFinding()
	switch {
	case noFindingLines > 0 && s.Findings > 0:
		s.Mixed = true
	case noFindingLines == 1 && nonBlank == 1:
		s.NoFindings, s.WellFormed = true, true
	case s.Findings > 0 && complete:
		s.WellFormed = true
	}
	return s
}

// ImplRecord is one implementation-review record.
type ImplRecord struct {
	ID      string
	Text    string
	Verdict string
}

// ImplRecords reads the implementation-review records of a subsection: each
// record_criterion line followed by a record_verdict line. It reports false
// when there are no records or one is incomplete.
func (r *Rules) ImplRecords(lines []string) ([]ImplRecord, bool) {
	var recs []ImplRecord
	for i := 0; i < len(lines); i++ {
		m := r.Re.RecordCriterion.FindStringSubmatchIndex(lines[i])
		if m == nil {
			continue
		}
		if i+1 >= len(lines) {
			return nil, false
		}
		v := r.Re.RecordVerdict.FindStringSubmatch(lines[i+1])
		if v == nil {
			return nil, false
		}
		recs = append(recs, ImplRecord{
			ID:      lines[i][m[2]:m[3]],
			Text:    Fold(lines[i][m[1]:]),
			Verdict: v[1],
		})
		i++
	}
	return recs, len(recs) > 0
}
