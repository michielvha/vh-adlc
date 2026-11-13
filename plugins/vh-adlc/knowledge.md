# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/c70769ebf43ea03a4bdffb3cda51954eb05b35a7/AGENTS.md

Pass `c70769ebf43ea03a4bdffb3cda51954eb05b35a7` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
