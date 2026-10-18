---
name: vh-adlc-investigate
description: Investigate an issue, failure, question or document for the vh-adlc loop, measuring the live tree instead of remembering, and write substantial findings into a document. Use only when the owner invokes /vh-adlc-investigate or explicitly asks for a vh-adlc investigation; it never ships a fix.
---

# vh-adlc-investigate

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

Report the knowledge line, what was measured and how, the hypotheses still open, and the smallest next
decision.
