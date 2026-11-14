---
name: vh-adlc-investigate
description: Investigate an issue, failure, question or document for the vh-adlc loop, measuring the live tree instead of remembering, and write substantial findings into a document. Use only when the owner invokes /vh-adlc-investigate or explicitly asks for a vh-adlc investigation; it never ships a fix. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-investigate

## Generic intake

For generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.

The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Input: an issue, a failure, a question or a document. Follow `references/loop.md` and
`references/authority.md`.

1. Get the binary and run `vh-adlc knowledge` with `conventions/documentation.md` and
   `guides/humanize-prose.md`, plus the pages the topic needs. Report the one-line result. If the binary
   cannot be obtained, continue with the notice `deterministic checks unavailable`; this operation changes
   no status.
2. Run `vh-adlc find` for the issue or topic and read any feature document it returns.
3. Measure. Run the commands, read the code at the exact revision, reproduce the failure. Keep four things
   apart in your notes and in the result: measured facts (with the command or `file:line`), observations
   from sources (with the link), hypotheses, and decisions.
4. When the owner asks for it, write substantial findings into an analysis document where the documentation
   convention at the revision says findings belong, and give any issue a short summary that links to it.
   Edit that prose with `guides/humanize-prose.md` first.
5. Never fix, commit code or ship from this operation. If a fix is wanted, the next step is
   `/vh-adlc-spec`.

Edit the report with `guides/humanize-prose.md` at the resolved revision. Report the knowledge line, what
was measured and how, the hypotheses still open, the smallest next decision, and the page and revision
used to edit the prose.

## Loop routes

This operation's loop role and route come from `.vh-adlc/loop.yaml` through
`bun scripts/loop/cli.ts route` (`references/loop-settings.md`); without the file, every role keeps the
host default. Before acting, read every file `bun scripts/loop/cli.ts context` lists: the repository's instruction
files and its project procedure, whose local rules apply alongside this procedure. A `host` route that names a model runs with it as a requested model.

With `findings_document: always` in loop settings, invoking this operation is the request to write the
findings document. Before writing, search the analysis documents under `analysis_dir` and the open
issues for the case (`scripts/loop/investigate.ts`, `findingsPlan`): extend a covering document instead
of creating a second one, and never leave an issue holding the only copy of the findings; an issue
update, where you have authority to make one, is a summary with a link to the document. State that the
conclusions come from primary sources read in this run. End with one verdict: act now, track (naming
the conditions that would change it) or reject. Issue creation keeps the authority rule in
`references/authority.md`.

## Issue labels

When the owner asks for a new issue, file it through the labels helper so it carries the labels
`references/issues.md` gives for your verdict. Run `bun scripts/labels/cli.ts file --repo <checkout>
--operation investigate --type <type label>` with `--title`, `--body-file` and a new `--output` file,
and the verdict: `--verdict "act now"`, `--verdict track` with `--waiting-on prerequisite` when the
findings document names a missing prerequisite or `--waiting-on decision` when the work waits on an
owner, product or architecture call, or `--verdict reject` for a rejected case the owner still wants
filed. Show the owner the title, body and labels it prints. Once they approve, create the issue with
`--preview <that file> --approved-digest <digest>`. When it reports missing labels, file nothing and
give its next step.
