# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/AGENTS.md

Pass `0e52f51f01b84eda75a976763c42d8ec0a07b544` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
