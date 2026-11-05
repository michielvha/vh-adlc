# Docs pin

The plugin reads its conventions from `vhco-pro/docs` at this revision:

https://github.com/vhco-pro/docs/blob/f8ccacbedf057159ea24136ba115cd9857bb22ac/AGENTS.md

Pass `f8ccacbedf057159ea24136ba115cd9857bb22ac` as `--plugin-pin` to every `vh-adlc` command.
`vh-adlc knowledge` decides whether the repository's own pin or this one applies, and every
operation reports its answer. Moving this pin is a reviewed plugin change with a version bump.
