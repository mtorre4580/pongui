---
name: check-deprecations
description: Verify that new or changed code uses no deprecated APIs (Phaser, Vite, Workbox, Node, DOM, any dependency or our own `@deprecated` helpers). Use before committing, before opening or updating a PR, and whenever you add or modify a function, method, helper, scene or dependency.
---

# Check deprecations

No new feature, fix or improvement may use something deprecated. Run this on the code you
added or changed (the branch diff against `main`), not on the whole repo.

## 1. Find what changed

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Include uncommitted work (`git diff`, `git diff --staged`) if there is any.

## 2. Typed code (`.ts` / `.tsx`): run the linter

`@typescript-eslint/no-deprecated` is on (type-aware) and flags every use of a symbol marked
`@deprecated` in its types: Phaser, DOM lib, `@types/node`, libraries and our own code.

```bash
pnpm lint
```

- Any `no-deprecated` error in a changed line must be fixed by moving to the replacement named in
  the message. Do not add `eslint-disable` for new code.
- The only allowed disables are pre-existing baseline lines marked `TODO: migrate…`, or code that
  must implement a legacy interface (e.g. a browser API mock). Each one carries a reason.
- If you touch a line that already has a baseline disable, migrate it in the same change when it
  is small; otherwise mention it in the PR.

## 3. What the linter cannot see

Check these by hand for every API the diff introduces:

- **Untyped deprecations**: APIs deprecated in docs or changelogs but not yet tagged in types.
  For each new import or call from a dependency, check the installed version's docs/changelog
  (`node_modules/<pkg>/CHANGELOG.md`, the package's `README`, or its official docs for the version
  in `package.json`). Prefer the API the current docs recommend.
- **Deprecated packages**: when the diff adds or bumps a dependency, run
  `pnpm view <pkg>@<version> deprecated` (empty output = fine) and watch `pnpm install` for
  `deprecated` warnings, including subdependencies it pulls in.
- **Node runtime deprecations**: if scripts use Node APIs, run them once with
  `node --throw-deprecation` / check for `DeprecationWarning` output (e.g. `url.parse`,
  `fs.exists`, `Buffer()` constructor).
- **Tooling config**: deprecated options in Vite, vite-plugin-pwa, Vitest, ESLint, Playwright or
  TypeScript config (the tools usually print a warning on `pnpm build` / `pnpm test:run`).

## 4. Report

In your summary (and in the PR "Testing" or "Notes" section) state:

- `pnpm lint` result, with no new `no-deprecated` disables;
- which new APIs or dependencies you checked by hand and that none are deprecated;
- any deprecated usage you found but left (only pre-existing code), with the replacement.

If something new is deprecated and has no replacement yet, stop and ask the user before using it.
