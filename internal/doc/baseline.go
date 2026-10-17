package doc

import (
	"bytes"
	"fmt"

	"github.com/michielvha/vh-adlc/internal/rules"
	"go.yaml.in/yaml/v3"
)

// Baseline returns the normative baseline of a document: each normative
// section's text and each normative frontmatter field's YAML value, with
// criterion checkboxes written as unticked and evidence and residual
// annotations removed. Two versions have the same baseline when these bytes
// are equal.
func Baseline(raw []byte, r *rules.Rules) []byte {
	return Parse("", raw, r).Baseline()
}

// Baseline returns the document's normative baseline; see the Baseline function.
func (d *Doc) Baseline() []byte {
	var b bytes.Buffer
	re := d.rules.Re
	for _, name := range d.rules.NormativeSections {
		s := d.Section(name)
		if s == nil {
			fmt.Fprintf(&b, "## %s (absent)\n", name)
			continue
		}
		fmt.Fprintf(&b, "## %s\n", name)
		for i := s.start; i < s.end; i++ {
			l := d.lines[i]
			if d.open(i) && d.isAnnotation(i) {
				i = d.annotationEnd(i) - 1
				continue
			}
			if d.open(i) {
				if m := re.CriterionLine.FindStringSubmatchIndex(l); m != nil {
					l = l[:m[2]] + " " + l[m[3]:]
				}
			}
			b.WriteString(l)
			b.WriteByte('\n')
		}
	}
	for _, name := range d.rules.NormativeFrontmatter {
		n := d.fields[name]
		if n == nil {
			fmt.Fprintf(&b, "frontmatter %s (absent)\n", name)
			continue
		}
		out, err := yaml.Marshal(n)
		if err != nil {
			out = []byte(n.Value)
		}
		fmt.Fprintf(&b, "frontmatter %s:\n%s", name, out)
	}
	return b.Bytes()
}
