---
name: vh-adlc-blog
description: Draft, revise or review an article using project evidence and the adopter's author voice. Use promote mode for an article plus social Markdown linking to the author's website. Does not publish or change software feature states.
---

# vh-adlc-blog

Use `references/blog.md` for the writer and promotion procedure. The plugin root
is two directories above this skill, and the referenced paths start there.

Resolve the verified binary with `scripts/ensure-vh-adlc.sh` through Bash, then
request `conventions/documentation.md`, `conventions/feature-documents.md` and
`guides/humanize-prose.md` with `knowledge`, using the plugin pin in `knowledge.md`.
Read the resolved pages and report the revision. Use the feature loop's knowledge
failure handling; article authoring itself needs no software feature document.

Input is the owner's article brief, existing article, editorial request, or
`promote <project or article>`. Read the adopter's instructions before writing.
For a new long-form article, complete the visual reading pass in
`references/blog.md`, including for nontechnical stories; revisions follow its
three revision kinds. Publication remains subject to `references/authority.md`.
Name hosted items in your report to the owner as `references/loop.md` step 5 says.

Check the rendered page on desktop and phone in each theme the site supports.
When rendering is unavailable, the handoff says `Rendered checks: unverified, <reason>`
and names the missing assets; a Markdown-only inspection is never called a rendered review.

Dispatch the prose and presentation editor at `agents/vh-adlc-blog-editor.agent.md`
without parent history, as `references/blog.md` says, with the original or source
notes, candidate, source-position inventory, edit reasons, voice references,
protected content and the Presentation inputs in `references/blog.md`.
The editor's role differs from the feature reviewer: it reviews articles, not lifecycle gates.
