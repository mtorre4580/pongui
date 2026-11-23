# CLAUDE.md — Boinky

Context guide for working in this repo. Read all of it before touching code.

## What it is

A bouncing-ball puzzle game that runs in the browser on desktop, tablet and phone, and installs
as a PWA (no app stores). The site root is a landing page that presents it; the game is at
`/play/`, which is also the installed app's start URL. The ball bounces on its own; the player steers it in the air, holds
jump for high bounces, collects every gem to open the exit and avoids hazards. It is an original
game in the genre of the late-80s bouncing-ball puzzlers: its own name, character, art, sounds
and levels. Never copy names, art, music or level layouts from an existing game.

It also ships as native iOS and Android apps through Capacitor (see Native apps).

The repository is **private** for now. The CodeQL, Dependency Review and Pages deploy workflows
skip themselves while it is private and switch on when it becomes public.

## Stack

| Area | Choice | Notes |
|---|---|---|
| Runtime | Node LTS (24) | `.nvmrc` at the root |
| Packages | pnpm | Never use npm or yarn. Commit `pnpm-lock.yaml` |
| Build | Vite + vite-plugin-pwa (Workbox `generateSW`) | `base: './'`: the build works from any folder |
| Engine | Phaser 3, **Canvas renderer** | WebGL shader compilation blocked start-up for over a second (see Performance) |
| Language | Strict TypeScript | |
| Physics | Custom, grid based (`src/game/physics.ts`) | Pure TS, no Phaser: deterministic and unit tested |
| Graphics | Vector textures generated at start-up | No image assets besides the app icons |
| Audio | Web Audio synthesis (`src/audio/sfx.ts`) | No audio files |
| i18n | Custom typed dictionaries in `src/i18n` | en (default), es, pt-BR; no dependencies |
| Tests | Vitest (unit), Playwright + `@axe-core/playwright` (browser), Lighthouse CI | |
| Lint / format | ESLint (typescript-eslint, type-aware) + Prettier | `@typescript-eslint/no-deprecated` is an error |
| Git hooks | husky + commitlint (`@commitlint/config-conventional`) | `pre-push` runs `pnpm lint` and `pnpm test:run` |
| CI | GitHub Actions | lint, typecheck, level validation, unit tests, build + bundle budget, `pnpm audit`, Playwright + axe, Lighthouse; CodeQL and dependency review once public |

## Commands

```bash
pnpm install
pnpm dev                # development server: landing at /, game at /play/ (?level=N opens a level)
pnpm build              # typecheck + production build with the service worker
pnpm preview            # serve the build
pnpm test               # Vitest in watch mode
pnpm test:run           # Vitest once (CI)
pnpm lint
pnpm typecheck          # tsc --noEmit
pnpm validate:levels    # parse every level, check its texts, prove it is solvable
pnpm check:bundle       # gzip budget per chunk (after pnpm build)
pnpm test:e2e           # Playwright + axe on desktop and phone (after pnpm build)
pnpm lhci               # Lighthouse CI on the built game
pnpm media              # README media, landing videos/screenshots and og-image (needs ffmpeg)
pnpm icons              # regenerate public/icons and the native sources in assets/
pnpm build:native       # game-only build in dist-native/ + `cap sync` into ios/ and android/
pnpm native:assets      # every iOS/Android icon and splash size from assets/
pnpm ios / pnpm android # open the native project in Xcode / Android Studio
```

## Structure

```
index.html             # landing page (English texts inline, see Landing page)
capacitor.config.ts    # native app id, name, start page and plugin settings
ios/  android/         # native projects (Capacitor); generated web files are git-ignored
assets/                # sources for native icons and splash screens
play/index.html        # the game page
public/landing/        # landing videos and screenshots, recorded by `pnpm media`
src/
  main.ts              # Phaser config, scenes, font loading, resize observer
  landing/             # landing page script, styles and messages/{en,es,pt-BR}.ts
  dev.ts               # dev-only console helpers: replay(i), demo(i), tick(n)
  native.ts            # Capacitor integration (storage, haptics, splash, status bar)
  game/                # pure game logic, no Phaser
    constants.ts       # grid, physics constants
    tiles.ts           # tile codes and map characters
    level.ts           # level JSON → ParsedLevel
    physics.ts         # World: step(dt, input) → events
    solver.ts          # best-first search between bounces (level validation, demos)
  scenes/              # Boot, Menu, LevelSelect, Game, Overlay (pause / complete / game over)
  gfx/                 # textures.ts (vector textures, baked layers), themes.ts (world colors), ui.ts
  input/controls.ts    # keyboard + touch (HTML buttons) + gamepad, one API
  audio/sfx.ts         # synthesized sound effects
  i18n/                # t(), localized(), locale detection, messages/{en,es,pt-BR}.ts
  levels/              # w<world>-<nn>.json (numeric order), index.ts (LEVELS, WORLDS), worlds.ts
  save.ts              # progress in localStorage (`boinky:save`)
  pwa.ts               # install prompt, iOS detection, fullscreen
tests/                 # Vitest: physics, levels, i18n
e2e/                   # Playwright: smoke, PWA/offline, axe
scripts/               # validate-levels, check-bundle, capture-media, make-icons
```

## Physics

- Fixed step of 1/120 s. The world is 20×12 tiles of 32 px; the ball is a 20 px box.
- The ball always bounces. A normal bounce climbs 1 tile, a high bounce (jump held at landing,
  buffered 0.12 s before or "upgraded" up to 0.07 s after) climbs 3, a spring climbs 6.
- Air control only: acceleration 2400 px/s², top speed 160 px/s.
- When landing or bumping a ceiling, hazards count only for the tile under the ball's center (or
  when they are all the ball touches). Side contacts always count.
- Ramps catch the ball on any contact (even over a hazard), snap it to the ramp's center and
  launch it with a fixed high arc (about 5 tiles). They must never be skippable by accident.
- A water drop puts out every fire tile of one contact (fire becomes solid ash). A hammer breaks
  the whole connected brick wall and the ball keeps going.
- `World.step` returns events (`bounce`, `break`, `collect`, `die`, `win`…); scenes only render
  them. Never put gameplay rules in scenes.

## Levels

- The game has worlds of **exactly 10 levels**, with ids `w<world>-<nn>` (numeric order: `w2` before
  `w10`). Each world has a name (`world.N` in i18n), colors (`gfx/themes.ts`) and two new
  mechanics introduced in its first levels. The plan is 10 worlds (100 levels); `WORLD_COUNT` in
  `src/levels/worlds.ts` says how many exist (the landing page reads it without the maps).
- Progress: a level is open when the previous one has a record, so a new world opens for players
  who already finished the last one. The level select shows one world per page (◀ ▶, or
  left/right at the edge of a row) and `?level=` accepts `12` or `2-3`.
- Level maps load in their own `levels.js` chunk (play.js is mostly Phaser and near its budget).
- JSON in `src/levels/`: `id`, `name` and `hint` as `{ en, es, pt-BR }`, `par` (seconds for the
  time star) and `map` (12 strings of 20 characters). The legend is in `CONTRIBUTING.md`.
- Every level teaches or tests one idea, introduced in its hint the first time it appears.
- Row 0 must be plain walls (`#`): the HUD is drawn over it and `parseLevel` rejects anything
  else. The floor row (11) is free and may hold hazards.
- `pnpm validate:levels` must pass: the map parses, every text exists in all languages, the solver
  beats it and the par time is above the solver's time (rule of thumb: 2.5× + 5 s).
- Fairness rules learnt the hard way: ramps at least 2 tiles wide with a low ceiling before them,
  gems over pits placed on the ramp's launch path, no soft locks (a restart always works).
- Play every new level by hand, and simulate naive play when in doubt (hold right, hold jump,
  different start timings): the solver only proves a level is possible, not that it is fair.
  `solve(level, maxNodes, state)` searches from any state: perturb each step of the bot's plan
  and check the level is still winnable from where the ball ends up (mistakes must be
  recoverable or kill you, rarely leave you stuck).

## Landing page

- Plain HTML + CSS + one small module (`src/landing/main.ts`): no framework and no Phaser, about
  15 KB gzip on first load (`main.js` has its own budget).
- Texts: `index.html` holds the English text of every `data-i18n` element (crawlers and no-JS
  visitors read real content) and `data-i18n-attr="attr:key"` for attributes. `tests/landing.test.ts`
  fails if the HTML and `src/landing/messages/en.ts` drift apart. The language is shared with the
  game (`boinky:locale`).
- Videos use `data-src` and load only when they scroll into view; they play only while visible,
  never autoplay with `prefers-reduced-motion`, and every clip has a pause button (WCAG 2.2.2).
  `data-src` paths are resolved relative to the page so the site works under any base folder.
- Media is recorded, never drawn by hand: `pnpm media` plays each mechanic's level with the solver
  (`demo(i, { banner: false })`) and encodes small MP4 clips with JPEG posters.
- `VITE_SITE_URL` in `.env` feeds the canonical link, Open Graph tags and the `VideoGame` JSON-LD.
- The service worker is registered from `src/pwa.ts` with a URL resolved from the bundle, so both
  pages register `/sw.js` with the root scope. Landing media is excluded from the precache.

## Native apps

- Capacitor 8 wraps the game for iOS (Swift Package Manager, no CocoaPods) and Android. App id
  `io.github.mtorre4580.boinky` (cannot change after the first store upload).
- `vite build --mode native` builds only the game into `dist-native/` (no PWA plugin, no public/
  folder) plus a root `index.html` fallback that Capacitor requires. The app starts at
  `play/index.html` (`server.appStartPath`): a bare `play/` gets the root page and loops.
- `src/native.ts` is the only place that touches Capacitor. `IS_NATIVE` is a build-time constant,
  so the web build contains no Capacitor code (check: `grep -l Capacitor dist/assets/*.js`).
  Plugins are imported dynamically inside `IS_NATIVE` branches.
- Saves and the locale are mirrored to `@capacitor/preferences` (iOS can purge a web view's
  localStorage) and restored before the game starts. Haptics: high bounce, springs, ramps,
  walls, death and win. The splash hides once the first scene draws.
- Native config: landscape only, status bar hidden, `UIRequiresFullScreen` on iPad,
  `ITSAppUsesNonExemptEncryption = false`; Android `sensorLandscape` and immersive mode in
  `MainActivity`.
- Inside the app there is no service worker, install button, fullscreen button or iOS install
  hint (`isStandalone()` is true).
- Test in the simulator: `pnpm build:native`, then build the `App` scheme in Xcode (or
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator`). JavaScript
  console output shows up as `⚡️ [log]` lines in the app's stdout.

## Design

- Modern flat vector look: navy gradient background with soft bubbles, teal solid blocks, a coral
  ball with eyes, bright tiles that read at a glance (yellow fragile, orange strong fragile, fire,
  purple spring, blue ramp, brick wall, steel spikes). Font: Fredoka (Latin subset, bundled).
- Full bleed: the canvas always covers the whole screen (`Phaser.Scale.EXPAND`, 1280×832
  minimum game area). `gfx/layout.ts` zooms the 640×416 world (about 2×) and centers it in the
  free area: the screen minus the safe areas (notch, Dynamic Island), read from the invisible
  `#layout-probe` element whose padding CSS sets (no bottom inset: the floor may run under the
  home indicator). Each scene says which world rectangle must stay visible and centers it; the
  game fits the whole 20×12 level. The HUD has no band of its own: it is a
  translucent bar over the level's top wall row. Backgrounds, the HUD
  bar and overlay dimming extend far past the world so the screen never shows empty bars.
  Textures are drawn at 2× and shown at 0.5.
- **Canvas renderer rules**: no `tint` (use `sparkTexture(color)`), no `fillGradientStyle` (bake
  gradients with a 2D canvas), and bake static layers (background, solid blocks) into textures
  instead of redrawing Graphics every frame.
- Touch play has no on-screen buttons: gestures over the whole screen (`input/gestures.ts`, pure
  and unit tested; wired in `input/controls.ts`). The first finger is an invisible joystick
  anchored where it lands (14px dead zone; the anchor trails the finger by at most 56px so
  reversing is instant); a second finger held down is the jump button; a double tap queues one
  high bounce for the next landing (`controls.disarmJump()` on bounce). `#stick` draws a faint
  ring and knob under the steering finger. Gestures are only on while a level is played
  (`controls.enableGestures`); menus use normal taps. Levels can carry a `hintTouch` that
  replaces the hint when playing by touch (levels 1 and 2 explain the gestures).
- Portrait on touch screens shows a "rotate your device" notice.

## Performance

- Lighthouse (desktop) must stay at 100/100/100/100 on both pages (`/` and `/play/`). Main-thread
  blocking was 1.3 s with WebGL and is ~10 ms with Canvas.
- Bundle budget in `bundle-budget.json` (Phaser is ~340 KB gzip of the 370 KB `index.js` limit).

## Accessibility (mandatory)

- Playable with keyboard, touch gestures and gamepad; menus navigate with arrows/D-pad and confirm with
  Enter/Space/A. Escape pauses and goes back.
- The HTML shell passes axe (WCAG 2.2 AA) on desktop and phone: `lang` follows the locale, the
  canvas container has an accessible name, and zoom is not disabled in the viewport meta.
- The visible scene is exposed as `body[data-scene]` for tests.

## Conventions

- **Every code comment is written in English**, no exceptions (team standard).
- **i18n**: English by default; the browser language picks Spanish or Portuguese; the choice is
  stored in `boinky:locale`. No visible text is hardcoded: use `t('key')` for UI and
  `localized(value)` for level texts. Keys live in `src/i18n/messages/en.ts` (source of truth);
  `es.ts` and `pt-BR.ts` have exactly the same keys and placeholders (enforced by type and tests).
- Tone: plain English; neutral Rioplatense Spanish (“juntá”, “probá”); Brazilian Portuguese.
- Gameplay logic stays in `src/game` (pure, deterministic, tested); scenes render and route input.
- Do not add dependencies without explaining in the PR why the existing ones are not enough.
- **No deprecated APIs** in new or changed code. `@typescript-eslint/no-deprecated` enforces it for
  typed code; before committing or opening a PR, run the `check-deprecations` skill
  (`.claude/skills/`) to cover what the linter cannot see.

## Testing

- Pure logic (physics, level parsing, i18n dictionaries, bundle budget): Vitest unit tests.
- Levels: `pnpm validate:levels` (also in CI) runs the solver on every level.
- Browser: Playwright against the production build, on desktop Chrome and a landscape phone:
  boot without errors, keyboard flow menu → level → pause, `?level=N`, touch gestures (no
  buttons, steering indicator), full-screen canvas, locale, installable manifest, offline
  reload, axe.
- A PR is not merged with failing checks.

## How to add…

**A level**: create `src/levels/w<world>-<nn>.json` (see Levels), run `pnpm validate:levels`,
play it, and update the README level count if it changes.

**A world**: ten levels `w<N>-01…10`, `WORLD_COUNT` in `src/levels/worlds.ts`, `world.N` in the
three message files, its colors in `gfx/themes.ts`, and the README, landing and Status counts.

**A tile or item**: add its code in `tiles.ts` (and map character), its behavior in
`physics.ts` with unit tests, its texture in `gfx/textures.ts`, its rendering in `scenes/Game.ts`,
its legend entry in `CONTRIBUTING.md`, and a level that introduces it.

**A text**: add the key to `en.ts`, `es.ts` and `pt-BR.ts`, then use `t('key')`.

## Git

- Main branch `main`. Branches `feat/…`, `fix/…`, `level/…`, `docs/…`, `chore/…`.
- Conventional commits: `feat:`, `fix:`, `level:`, `test:`, `chore:`, `docs:` (also `refactor`,
  `perf`, `style`, `ci`, `build`, `revert`). Enforced by the `commit-msg` hook.
- Commit messages: `type: subject`, imperative mood, lowercase, no trailing period, header ≤ 72
  chars. One logical change per commit; add a body only when the *why* is not obvious.
- Hooks are installed by `pnpm install` (`prepare: husky`). Do not skip them with `--no-verify`.
- Claude Code hooks live in `.claude/settings.json`: after every `Edit`/`Write`, a `PostToolUse`
  hook formats that file with Prettier. Run `pnpm format` after editing files through Bash.
- Every PR fills in `.github/pull_request_template.md`; write “N/A” for sections that do not apply.

## Status

- [x] World 1 — 10 levels, desktop/touch/gamepad controls, PWA, three languages
- [x] Project setup — CI, hooks, browser tests, Lighthouse, docs
- [x] Landing page
- [x] World 2 — Crystal Caves: keys and lock blocks, moss
- [ ] Worlds 3–10 (planned: clouds and updrafts, switches and pushers, portals and water, ice,
      crumbling blocks and vents, low gravity and bumpers, dark rooms and phase blocks, rainbow
      bridges)
- [x] Native apps — Capacitor iOS and Android projects (iOS verified in the simulator)
- [ ] Store release (developer accounts, signing, store listings, privacy policy)
- [ ] Public release (license, Pages deploy, CodeQL)
