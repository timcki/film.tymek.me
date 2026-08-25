# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A private weekly film-voting site for one group of ~22 friends, deployed at
<https://film.tymek.me>. SvelteKit 2 + Svelte 5 runes + better-sqlite3, served by
adapter-node behind Caddy, packaged and deployed as a Nix flake.

Four documents carry the intent, and they are worth reading before changing behaviour:

- `README.md` is the short, public-facing introduction. Keep it short.
- `docs/operations.md` covers deployment, backups, handing out links, the archive, and
  where this deliberately diverges from the spec. Operational detail belongs there, not
  in the README and not here.
- `filmnight-spec.md` is the rules specification. Code comments cite it by section
  (`§3.5`, `§8.3`); keep that habit when you touch rule logic.
- `filmnight-v2.html` is the visual prototype `src/app.css` was ported from.

## Commands

```sh
npm run dev        # vite dev server
npm test           # vitest, the acceptance suite (24 files)
npm run test:watch
npm run check      # svelte-kit sync && svelte-check; must be 0 errors
npm run build      # adapter-node output into build/
npm run seed       # bundles scripts/seed.ts and runs it; creates roster, opens week 1
```

First-time local setup needs `cp .env.example .env` with a TMDB v4 read token, and
`mkdir -p data`. `ORIGIN` must be set or SvelteKit form actions fail their CSRF check.

There is no linter and no formatter config. Match the surrounding style: tabs, single
quotes, semicolons.

## Invariants

Breaking any of these is how this app goes subtly wrong rather than loudly wrong.

1. **Derived values are caches with exactly one writer.** `film.score` is rebuilt
   wholesale by `rescoreAll()` and `person.xp` by `rexpAll()`, both inside the mutating
   transaction that touched their inputs. Never increment either in place.
2. **Flash votes never touch `ballot`.** `runoff_ballot` is a separate table on purpose:
   being in the room breaks a tie, it does not buy influence.
3. **Every mutation goes through `immediate(db, fn)`** in `src/lib/server/db.ts`, which
   takes the write lock up front so concurrent writers serialise instead of failing at
   COMMIT.
4. **Copy lives in `src/lib/i18n.ts` and `src/lib/i18n.admin.ts`, nowhere else**, in two
   typed dictionaries a test holds to the same key set. Adding a string means adding it in
   Polish and English. Polish plurals have three forms; use the existing helpers.
5. **The rules screen is generated from the active `RuleSet`.** Changing a number in
   `src/lib/server/rules.ts` rewrites what the app says about itself. Never hardcode a
   rule number into prose.
6. **Rule violations travel as a code plus parameters**, said in the reader's language at
   the edge, falling back to English for an unknown code. Do not return a rendered
   sentence from a server module.
7. **Adding a column is the only supported migration shape.** Put it in `ADDED_COLUMNS`
   in `src/lib/server/schema.ts`; it is applied on every open, guarded on
   `PRAGMA table_info`. Anything else needs doing by hand against a backup.

## Conventions

- Relative imports inside `src/lib/server` and `tests` carry the `.js` extension
  (`./rules.js`); Svelte and route files use the `$lib` alias without one.
- `src/lib/server/**` is server-only. Anything the client also needs lives one level up
  (`src/lib/levels.ts`, `src/lib/themes.ts`, `src/lib/i18n.ts`).
- Timestamps are ISO strings via `iso()` in `src/lib/server/time.ts`, and domain functions
  take `now` as an argument rather than reading the clock.
- Schema comments explain why a column exists, not what its type is. Keep that.

## Tests

`tests/setup.ts` fakes only `Date`, pinned to `2026-08-03T10:00:00Z`, because the
scenarios freeze their clock there and the domain functions default to the real one.
Timers stay real. A test that constructs its own dates must stay inside that week.

`tests/helpers.ts` gives you `freshDb(ruleSetId)` against `:memory:` plus scenario
builders that bypass slot checks. Prefer them over hand-rolled inserts.

## Deployment

Push and rebuild; nothing is built on the box by hand and nothing is rsynced. The full
procedure, the systemd layout, and the backup and restore steps are in
`docs/operations.md`.

Two things to remember when changing packaging: `nix/package.nix` pins the build and the
service to the same `nodejs_24`, and its source filter is an allowlist, so a new top-level
file stays out of the world-readable store until you add it there on purpose.

## Handle with care

- `data/identity-links.md` is gitignored and never leaves the machine. **The personal
  links in it are identities**; anyone holding one is that person. It is a stale copy, so
  read a current link out of `person.token` rather than trusting the file.
- Avatars are BLOBs served from `/avatar/:id` behind the personal-link gate. Keep them
  there.
- `scripts/backfill.ts` is a one-off that refuses to run twice. Do not generalise it.
- Version control here is Jujutsu (`jj`), not git. The `origin` remote is a tangled.org
  DID with no repository path, which is correct as it stands.
