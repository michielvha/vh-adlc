# Project documentation truth policy

Eligible documents are `README.md` and tracked Markdown under `docs/current/`.
The `meta` set is `README.md`. Exclude `docs/history/` from automatic selection.
An exact sweep may explicitly select a tracked Markdown file under `docs/history/`.

The default next batch size is 1. Run `bash scripts/select-docs-truth.sh next`
for an ordered inventory of tab-separated paths and reasons. Exit status 0
means the inventory is complete. Run `bash scripts/select-docs-truth.sh report`
for recorded freshness. The verification history is `.vh-adlc/docs-truth-history.tsv`.

Use committed `config/service.env` and the `Makefile` as the initial source snapshot.
Read additional committed source when a claim calls for it. Treat a discrepancy with the intended client contract
as a product issue. Use the source to verify each claim before proposing a doc edit.
This example uses the shared read-only operation.
