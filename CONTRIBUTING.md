# Contributing to Boinky

Thanks for helping! New levels, mechanics, translations and fixes are all welcome.

## Before you start

- Requires Node 24 (`.nvmrc`) and **pnpm** (never npm or yarn).
- `pnpm install` also installs the git hooks: commit messages follow Conventional Commits and
  `pre-push` runs lint and tests.
- Read [`CLAUDE.md`](./CLAUDE.md): it has the physics, the level format, the design rules and the
  code conventions.

## Good first contributions

- **A new level.** Add `src/levels/w<world>-<nn>.json` (ten per world, loaded in numeric order) with
  `id`, `name` and `hint` in `en`, `es` and `pt-BR`, a `par` time in seconds and a 20×12 `map`.
  Run `pnpm validate:levels`: it fails if the map does not parse, a language is missing, the
  solver cannot beat it or the par time is lower than the bot's. Then play it by hand.
- **Translation fixes** in `src/i18n/messages/{es,pt-BR}.ts` (game),
  `src/landing/messages/{es,pt-BR}.ts` (landing page) or in a level's `name` and `hint`. English
  landing texts live in both `index.html` and `src/landing/messages/en.ts`: change them together.
- **Bug reports** with the steps to reproduce, the level, device, browser and language.

## Map legend

| Char | Tile |
|---|---|
| `#` | solid block |
| `x` | fragile: breaks after 1 bounce |
| `X` | strong fragile: breaks after 3 bounces |
| `^` | fire: deadly, a water drop puts it out |
| `s` | spring: bounce of 6 blocks |
| `<` `>` | ramp: catches the ball and always launches it the same way (~5 blocks) |
| `w` | brick wall: a hammer breaks the whole connected wall |
| `*` | spikes |
| `L` | lock block: a key opens the whole connected group (from any side) |
| `m` | moss: always a low bounce, even with jump held |
| `-` | cloud: one-way platform, you pass through it from below and the sides |
| `\|` | updraft: rising air that lifts the ball while its center is inside |
| `o` | switch: bouncing on it or bonking it from below flips every A and B block |
| `A` `B` | toggle blocks: `A` is solid while the switches are on, `B` while they are off (off at the start) |
| `(` `)` | pusher: catches the ball and throws it left / right in a low, fast hop |
| `g` `d` `h` `l` `k` | gem, water drop, hammer, extra life, key |
| `P` `E` | start and exit |
| `.` | empty |

Row 0 must be plain walls (`#`): the HUD covers it. The floor row is free for hazards. If a hint
names keys or buttons, add a `hintTouch` with the touch-gesture version (see levels 1 and 2).

Reach, for design: a normal bounce climbs 1 block and travels about 2; a high bounce climbs 3 and
travels about 3; a spring climbs 6.

## Rules that keep levels fair

- Every level teaches or tests one idea, and the first level that uses a mechanic introduces it
  in its hint.
- No unfair traps: ramps are at least 2 blocks wide, gems over pits sit on the path a ramp
  launches you along, and a mistake leads to a restart, never to a soft lock without one.
- The par time is roughly 2.5× the solver's time plus 5 seconds.

## Pull requests

1. Branch from `main`: `feat/…`, `fix/…`, `level/…`, `docs/…`, `chore/…`.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:run` and `pnpm validate:levels`.
3. Fill in the pull request template (write “N/A” for sections that do not apply).
