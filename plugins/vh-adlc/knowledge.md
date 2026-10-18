# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md

Pass `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
