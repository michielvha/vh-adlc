# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/AGENTS.md

Pass `d8f07c9dd69038375a535af8ad586086688f85ab` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
