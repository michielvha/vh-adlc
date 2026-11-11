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
Publication remains subject to `references/authority.md`.

For an independent prose pass, dispatch the editor at
`agents/vh-adlc-blog-editor.agent.md` with the original or source notes, candidate,
source-position inventory, edit reasons, voice references and protected content.
The editor's role differs from the feature reviewer: it reviews prose, not gates.
