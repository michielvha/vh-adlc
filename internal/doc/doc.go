// Package doc parses a feature document with the patterns of the rules block.
// Criteria, tasks, tables and review subsections are found by those patterns
// anywhere outside fenced code blocks, and open questions inside the Open
// Questions section. Other section names come only from the block's required
// and normative section lists.
package doc

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"github.com/michielvha/vh-adlc/internal/report"
	"github.com/michielvha/vh-adlc/internal/rules"
	"go.yaml.in/yaml/v3"
)

// sectionOpenQuestions is the schema-1 section the no_open_questions
// condition reads.
const sectionOpenQuestions = "Open Questions"

// Schema-1 names of the Review Log columns the binary reads.
const (
	colReview    = "Review"
	colKind      = "Kind"
	colCommit    = "Commit"
	colModel     = "Model"
	colIsolation = "Isolation"
	colOutcome   = "Outcome"
)

// Doc is a parsed feature document. Line numbers are 1-based file lines.
type Doc struct {
	Path   string
	Raw    []byte
	Status string
	Branch string
	Issue  string
	Covers []string

	Sections      []Section
	Criteria      []Criterion
	Tasks         []Task
	OpenQuestions []int
	TestPlan      *Table
	ReviewLog     *Table
	Reviews       []Review
	Subsections   []Subsection

	// Shape holds the findings that make the document malformed.
	Shape []report.Finding

	fields map[string]*yaml.Node
	lines  []string
	fenced []bool
	body   int
	rules  *rules.Rules
}

// Section is a level-two heading and the lines up to the next one.
type Section struct {
	Name       string
	Line       int
	start, end int // line indexes of the content, end exclusive
}

// Criterion is one acceptance criterion.
type Criterion struct {
	ID       string
	Ticked   bool
	Text     string
	Line     int
	Evidence bool
	Residual bool
}

// Task is one task line.
type Task struct {
	ID     string
	Ticked bool
	Line   int
	Refs   []string
}

// Table is a Markdown table.
type Table struct {
	Line   int
	Header []string
	Rows   []Row
}

// Row is one table body row.
type Row struct {
	Line  int
	Cells []string
}

// Review is one Review Log row.
type Review struct {
	ID         string
	Kind       string
	Commit     string
	RawCommit  string
	Dirty      bool
	Model      string
	Isolation  string
	Outcome    string
	Line       int
	Acceptance bool
}

// Subsection is a ### R-<n> subsection: its lines without leading and
// trailing blank lines.
type Subsection struct {
	ID    string
	Line  int
	Lines []string
}

var fenceRe = regexp.MustCompile("^\\s*(```|~~~)")

func shape(code, format string, a ...any) report.Finding {
	return report.Finding{Code: code, Message: fmt.Sprintf(format, a...)}
}

// Parse parses a document. It never fails: problems that prevent evaluation
// are recorded in Shape.
func Parse(path string, raw []byte, r *rules.Rules) *Doc {
	d := &Doc{Path: path, Raw: raw, rules: r, fields: map[string]*yaml.Node{}}
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	d.lines = strings.Split(strings.TrimSuffix(text, "\n"), "\n")
	d.parseFrontmatter()
	d.markFences()
	d.parseSections()
	d.parseCriteria()
	d.parseTasks()
	d.parseOpenQuestions()
	d.parseTables()
	d.parseSubsections()
	for i := range d.Shape {
		d.Shape[i].Path = path
	}
	return d
}

func (d *Doc) addShape(line int, code, format string, a ...any) {
	f := shape(code, format, a...)
	f.Line = line
	d.Shape = append(d.Shape, f)
}

func (d *Doc) parseFrontmatter() {
	r := d.rules
	end := -1
	if len(d.lines) > 0 && d.lines[0] == "---" {
		for i := 1; i < len(d.lines); i++ {
			if d.lines[i] == "---" {
				end = i
				break
			}
		}
	}
	if end < 0 {
		d.addShape(1, report.CodeFrontmatterMissing, "the document has no YAML frontmatter between --- lines")
		return
	}
	d.body = end + 1
	var root yaml.Node
	if err := yaml.Unmarshal([]byte(strings.Join(d.lines[1:end], "\n")), &root); err != nil || len(root.Content) != 1 || root.Content[0].Kind != yaml.MappingNode {
		d.addShape(1, report.CodeFrontmatterMissing, "the frontmatter is not a YAML mapping")
		return
	}
	m := root.Content[0]
	for i := 0; i+1 < len(m.Content); i += 2 {
		d.fields[m.Content[i].Value] = m.Content[i+1]
	}
	d.Status = d.scalar("status")
	d.Branch = d.scalar("branch")
	d.Issue = d.scalar("issue")
	if n := d.fields["covers"]; n != nil && n.Kind == yaml.SequenceNode {
		for _, c := range n.Content {
			d.Covers = append(d.Covers, c.Value)
		}
	}
	required := slices.Clone(r.RequiredFrontmatter)
	required = append(required, r.RequiredFrontmatterFrom[d.Status]...)
	for _, f := range required {
		if _, ok := d.fields[f]; !ok {
			d.addShape(1, report.CodeFrontmatterFieldMissing, "frontmatter field %q is required", f)
		}
	}
	if _, ok := d.fields["status"]; ok && !slices.Contains(r.Statuses, d.Status) {
		d.addShape(1, report.CodeStatusUnknown, "status %q is not one of the rules' statuses", d.Status)
	}
}

func (d *Doc) scalar(name string) string {
	n := d.fields[name]
	if n == nil || n.Kind != yaml.ScalarNode || n.Tag == "!!null" {
		return ""
	}
	return n.Value
}

func (d *Doc) markFences() {
	d.fenced = make([]bool, len(d.lines))
	in := false
	for i := d.body; i < len(d.lines); i++ {
		if fenceRe.MatchString(d.lines[i]) {
			d.fenced[i] = true
			in = !in
			continue
		}
		d.fenced[i] = in
	}
	for i := 0; i < d.body && i < len(d.lines); i++ {
		d.fenced[i] = true
	}
}

// open reports whether line i is body text outside a fenced block.
func (d *Doc) open(i int) bool { return i >= d.body && i < len(d.lines) && !d.fenced[i] }

func (d *Doc) parseSections() {
	for i := d.body; i < len(d.lines); i++ {
		if !d.open(i) {
			continue
		}
		l := d.lines[i]
		if strings.HasPrefix(l, "# ") || strings.HasPrefix(l, "## ") {
			if n := len(d.Sections); n > 0 && d.Sections[n-1].end < 0 {
				d.Sections[n-1].end = i
			}
		}
		if strings.HasPrefix(l, "## ") {
			d.Sections = append(d.Sections, Section{Name: strings.TrimSpace(l[3:]), Line: i + 1, start: i + 1, end: -1})
		}
	}
	if n := len(d.Sections); n > 0 && d.Sections[n-1].end < 0 {
		d.Sections[n-1].end = len(d.lines)
	}
	last, lastName := -1, ""
	for _, name := range d.rules.RequiredSections {
		idx := slices.IndexFunc(d.Sections, func(s Section) bool { return s.Name == name })
		if idx < 0 {
			d.addShape(0, report.CodeSectionMissing, "required section %q is missing", name)
			continue
		}
		if idx < last {
			d.addShape(d.Sections[idx].Line, report.CodeSectionOrder, "section %q comes before %q; the rules require the opposite order", name, lastName)
		}
		last, lastName = idx, name
	}
}

// Section returns the first section with the name, or nil.
func (d *Doc) Section(name string) *Section {
	for i := range d.Sections {
		if d.Sections[i].Name == name {
			return &d.Sections[i]
		}
	}
	return nil
}

func (d *Doc) isAnnotation(i int) bool {
	return d.rules.Re.Evidence.MatchString(d.lines[i]) || d.rules.Re.Residual.MatchString(d.lines[i])
}

// isContinuation reports whether line i continues the text above it.
func (d *Doc) isContinuation(i int) bool {
	l := d.lines[i]
	re := d.rules.Re
	return d.open(i) && re.Continuation.MatchString(l) && !d.isAnnotation(i) && !re.CriterionLine.MatchString(l) && !re.TaskLine.MatchString(l)
}

// annotationEnd returns the index after the annotation starting at line i.
func (d *Doc) annotationEnd(i int) int {
	j := i + 1
	for j < len(d.lines) && d.isContinuation(j) {
		j++
	}
	return j
}

func ticked(s string) bool { return strings.TrimSpace(s) != "" }

func (d *Doc) parseCriteria() {
	re := d.rules.Re
	for i := d.body; i < len(d.lines); i++ {
		if !d.open(i) {
			continue
		}
		m := re.CriterionLine.FindStringSubmatchIndex(d.lines[i])
		if m == nil {
			continue
		}
		l := d.lines[i]
		c := Criterion{ID: l[m[4]:m[5]], Ticked: ticked(l[m[2]:m[3]]), Line: i + 1}
		parts := []string{l[m[1]:]}
		j := i + 1
		for j < len(d.lines) && d.isContinuation(j) {
			parts = append(parts, d.lines[j])
			j++
		}
		for j < len(d.lines) && d.open(j) && d.isAnnotation(j) {
			if re.Evidence.MatchString(d.lines[j]) {
				c.Evidence = true
			} else {
				c.Residual = true
			}
			j = d.annotationEnd(j)
		}
		c.Text = rules.Fold(strings.Join(parts, " "))
		d.Criteria = append(d.Criteria, c)
		i = j - 1
	}
}

func (d *Doc) parseTasks() {
	re := d.rules.Re
	for i := d.body; i < len(d.lines); i++ {
		if !d.open(i) {
			continue
		}
		m := re.TaskLine.FindStringSubmatchIndex(d.lines[i])
		if m == nil {
			continue
		}
		l := d.lines[i]
		t := Task{ID: l[m[4]:m[5]], Ticked: ticked(l[m[2]:m[3]]), Line: i + 1}
		text := []string{l[m[1]:]}
		for j := i + 1; j < len(d.lines) && d.isContinuation(j); j++ {
			text = append(text, d.lines[j])
		}
		for _, tok := range strings.FieldsFunc(strings.Join(text, " "), func(r rune) bool {
			return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '-'
		}) {
			if re.CriterionID.MatchString(tok) && !slices.Contains(t.Refs, tok) {
				t.Refs = append(t.Refs, tok)
			}
		}
		d.Tasks = append(d.Tasks, t)
	}
}

// parseOpenQuestions finds open_question lines inside the Open Questions
// section, as the standard's no_open_questions condition reads.
func (d *Doc) parseOpenQuestions() {
	s := d.Section(sectionOpenQuestions)
	if s == nil {
		return
	}
	for i := s.start; i < s.end; i++ {
		if d.open(i) && d.rules.Re.OpenQuestion.MatchString(d.lines[i]) {
			d.OpenQuestions = append(d.OpenQuestions, i+1)
		}
	}
}

var separatorCell = regexp.MustCompile(`^:?-+:?$`)

func cells(line string) []string {
	s := strings.TrimSpace(line)
	s = strings.TrimPrefix(s, "|")
	s = strings.TrimSuffix(s, "|")
	var out []string
	var cur strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) && s[i+1] == '|' {
			cur.WriteByte('|')
			i++
			continue
		}
		if s[i] == '|' {
			out = append(out, strings.TrimSpace(cur.String()))
			cur.Reset()
			continue
		}
		cur.WriteByte(s[i])
	}
	return append(out, strings.TrimSpace(cur.String()))
}

func (d *Doc) parseTables() {
	r := d.rules
	for i := d.body; i < len(d.lines); i++ {
		if !d.open(i) || !strings.HasPrefix(d.lines[i], "|") {
			continue
		}
		start := i
		for i < len(d.lines) && d.open(i) && strings.HasPrefix(d.lines[i], "|") {
			i++
		}
		if i-start < 2 || !isSeparator(cells(d.lines[start+1])) {
			continue
		}
		t := &Table{Line: start + 1, Header: cells(d.lines[start])}
		for j := start + 2; j < i; j++ {
			t.Rows = append(t.Rows, Row{Line: j + 1, Cells: cells(d.lines[j])})
		}
		if d.TestPlan == nil && slices.Equal(t.Header, r.TestPlan.Columns) {
			d.TestPlan = t
		}
		if d.ReviewLog == nil && slices.Equal(t.Header, r.ReviewLogColumns) {
			d.ReviewLog = t
		}
	}
	if d.TestPlan == nil {
		d.addShape(0, report.CodeTestPlanHeader, "no table has the Test Plan header %s", strings.Join(r.TestPlan.Columns, " | "))
	}
	if d.ReviewLog == nil {
		d.addShape(0, report.CodeReviewLogHeader, "no table has the Review Log header %s", strings.Join(r.ReviewLogColumns, " | "))
		return
	}
	col := map[string]int{}
	for _, name := range []string{colReview, colKind, colCommit, colModel, colIsolation, colOutcome} {
		idx := slices.Index(r.ReviewLogColumns, name)
		if idx < 0 {
			d.addShape(d.ReviewLog.Line, report.CodeReviewLogHeader, "the rules' Review Log columns lack %q", name)
			return
		}
		col[name] = idx
	}
	a := r.AcceptanceRow
	for _, row := range d.ReviewLog.Rows {
		cell := func(name string) string {
			if col[name] < len(row.Cells) {
				return row.Cells[col[name]]
			}
			return ""
		}
		raw := cell(colCommit)
		commit := strings.Trim(raw, "`")
		dirty := strings.HasSuffix(commit, "+dirty")
		rv := Review{
			ID: cell(colReview), Kind: cell(colKind), RawCommit: raw,
			Commit: strings.TrimSuffix(commit, "+dirty"), Dirty: dirty,
			Model: cell(colModel), Isolation: cell(colIsolation), Outcome: cell(colOutcome), Line: row.Line,
		}
		rv.Acceptance = rv.Kind == a.Kind && rv.Model == a.Model && rv.Isolation == a.Isolation && rv.Outcome == a.Outcome
		d.Reviews = append(d.Reviews, rv)
	}
}

func isSeparator(cs []string) bool {
	for _, c := range cs {
		if !separatorCell.MatchString(c) {
			return false
		}
	}
	return len(cs) > 0
}

func (d *Doc) parseSubsections() {
	for i := d.body; i < len(d.lines); i++ {
		if !d.open(i) || !strings.HasPrefix(d.lines[i], "### ") {
			continue
		}
		id := strings.TrimSpace(d.lines[i][4:])
		if !d.rules.Re.ReviewID.MatchString(id) {
			continue
		}
		j := i + 1
		for j < len(d.lines) && (!d.open(j) || !strings.HasPrefix(d.lines[j], "#")) {
			j++
		}
		d.Subsections = append(d.Subsections, Subsection{ID: id, Line: i + 1, Lines: TrimBlank(d.lines[i+1 : j])})
		i = j - 1
	}
}

// TrimBlank removes leading and trailing blank lines.
func TrimBlank(lines []string) []string {
	start, end := 0, len(lines)
	for start < end && strings.TrimSpace(lines[start]) == "" {
		start++
	}
	for end > start && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}
	return lines[start:end]
}

// TestPlanIDs returns the criterion IDs listed in well-formed Test Plan
// cells, in order and without repeats.
func (d *Doc) TestPlanIDs() []string {
	var ids []string
	if d.TestPlan == nil {
		return nil
	}
	for _, row := range d.TestPlan.Rows {
		if len(row.Cells) == 0 || !d.rules.Re.CriterionCell.MatchString(row.Cells[0]) {
			continue
		}
		for id := range strings.SplitSeq(row.Cells[0], ",") {
			if id = strings.TrimSpace(id); !slices.Contains(ids, id) {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

// LatestReview returns the last review row of the kind that is not an
// acceptance, or nil.
func (d *Doc) LatestReview(kind string) *Review {
	for i := len(d.Reviews) - 1; i >= 0; i-- {
		if r := &d.Reviews[i]; !r.Acceptance && r.Kind == kind {
			return r
		}
	}
	return nil
}

// LatestAcceptance returns the last acceptance row, or nil.
func (d *Doc) LatestAcceptance() *Review {
	for i := len(d.Reviews) - 1; i >= 0; i-- {
		if d.Reviews[i].Acceptance {
			return &d.Reviews[i]
		}
	}
	return nil
}

// ReviewByID returns the last non-acceptance review row with the ID, or nil.
func (d *Doc) ReviewByID(id string) *Review {
	for i := len(d.Reviews) - 1; i >= 0; i-- {
		if r := &d.Reviews[i]; !r.Acceptance && r.ID == id {
			return r
		}
	}
	return nil
}

// SubsectionFor returns the first subsection for the review ID, or nil.
func (d *Doc) SubsectionFor(id string) *Subsection {
	for i := range d.Subsections {
		if d.Subsections[i].ID == id {
			return &d.Subsections[i]
		}
	}
	return nil
}

// Rules returns the rules the document was parsed with.
func (d *Doc) Rules() *rules.Rules { return d.rules }
