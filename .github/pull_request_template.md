<!--
  Thanks for contributing to Pongui!
  Fill in every section. Write "N/A" when a section does not apply instead of deleting it.
  The PR title must follow Conventional Commits, e.g. `level: add world 2 ice levels`.
-->

## Summary

<!-- What does this PR do and why? 1–3 sentences focused on the problem and the outcome. -->

Closes #

## Type of change

<!-- Check every option that applies. -->

- [ ] `feat` — new feature or mechanic
- [ ] `fix` — bug fix
- [ ] `level` — new or updated levels
- [ ] `refactor` — code change with no behavior change
- [ ] `perf` — performance improvement
- [ ] `style` — formatting or visual-only change
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `chore` / `build` / `ci` — tooling, dependencies or pipeline
- [ ] **Breaking change** — physics, level format or saved progress (`localStorage`) change

## Changes

<!-- Bullet list of the main changes. Mention files or areas reviewers should focus on. -->

-

## Screenshots / recordings

<!-- Required for visual or gameplay changes: desktop and phone. Write "N/A" otherwise. -->

| Device  | Before | After |
| ------- | ------ | ----- |
| Desktop |        |       |
| Phone   |        |       |

## How to test

<!-- Steps a reviewer can follow to verify the change locally. -->

1. `pnpm install && pnpm dev`
2.
3.

## Checklist

### Quality

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm test:run` passes and new logic is covered by tests
- [ ] `pnpm build` and `pnpm check:bundle` pass (bundle within budget)
- [ ] `pnpm test:e2e` passes (Playwright + axe, desktop and phone)

### Levels _(only if levels or physics changed)_

- [ ] `pnpm validate:levels` passes: every level is solvable and its par time is above the bot's
- [ ] Name and hint exist in `en`, `es` and `pt-BR`
- [ ] Played by hand at least once: no unfair traps (skippable ramps, dead ends without restart)

### i18n

- [ ] No hardcoded visible text: everything goes through `t('key')` or `localized(...)`
- [ ] New keys added to `en.ts`, `es.ts` and `pt-BR.ts`

### Accessibility & UX _(only if the UI changed)_

- [ ] Fully playable with keyboard, touch and gamepad
- [ ] Touch gestures still work (slide to steer, double tap / second finger to bounce higher)
- [ ] Checked on desktop and on a phone in landscape

### Conventions

- [ ] All code comments are in English
- [ ] No deprecated APIs (`check-deprecations` skill)
- [ ] Branch name and commits follow the conventions; hooks were not skipped (`--no-verify`)

### Docs

- [ ] `CLAUDE.md` / `README.md` updated if behavior, structure or commands changed

## Dependencies added

<!-- Name each new dependency and explain why the existing ones are not enough. Write "None" otherwise. -->

None

## Notes for reviewers

<!-- Risks, trade-offs, follow-ups or anything that needs special attention. -->
