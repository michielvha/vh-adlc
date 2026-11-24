# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/AGENTS.md

Pass `1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
