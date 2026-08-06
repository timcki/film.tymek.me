# Wieczorki filmowe

A private weekly film-voting site. One nomination each per week, two voting points each
per week that expire unspent, film scores that fade a quarter each week, and on Thursday
the top three go to whoever turned up. Showing up earns XP and film-buff ranks.

Implements `filmnight-spec.md`; the interface follows `filmnight-v2.html`. Polish by
default with an English toggle. SvelteKit 2 + Svelte 5 runes + better-sqlite3, served by
adapter-node behind Caddy.

Live at **https://film.tymek.me**

## Local development

```sh
npm install
cp .env.example .env        # add your TMDB read token
mkdir -p data
npm run seed                # creates the roster, opens week 1, prints the links once
npm run dev
```

`npm test` runs the acceptance suite (§11 of the spec, plus notes, avatars and copy: 146
tests). `npm run check` typechecks.

## How it fits together

| Path | What it does |
|---|---|
| `src/lib/server/rules.ts` | the four rule sets, scoring (incl. fade), budgets, ordering, `titleKey` |
| `src/lib/server/scoring.ts` | scores derived from the ballot table; `rescoreAll()` |
| `src/lib/server/weeks.ts` | `closeWeek`, attrition, bank accrual, `finish` |
| `src/lib/server/runoffs.ts` | flash votes, tally, `closeRunoff` |
| `src/lib/server/films.ts` | `setPoints` with the 30 s grace window, `nominate`, standings |
| `src/lib/server/attendance.ts` | check-in behind the room code, `attendedWeeks` |
| `src/lib/server/xp.ts` | XP derived from the tables; `rexpAll()` cache rebuild |
| `src/lib/levels.ts` | the XP ladder thresholds, shared with the client |
| `src/lib/changelog.ts` | dated news entries the layout shows once per person |
| `src/lib/server/scheduler.ts` | the minute tick that closes weeks and expired runoffs |
| `src/hooks.server.ts` | cookie identity; everything but `/u/:token` and `/f/:code` needs it |
| `src/lib/i18n.ts` | every string the app says about itself, in Polish and English |
| `src/app.css` | the v2 look, ported from `filmnight-v2.html` |

### The interface

Three tabs on a bottom bar: **Lista** (`/`), **Obejrzane** (`/history`), **Ty** (`/me`).
`/host` is the projector view for Thursday and `/f/:code` is what the room scans.

Copy lives in `src/lib/i18n.ts` and nowhere else, in two typed dictionaries that a test
holds to the same set of keys. The rules screen is generated from the active `RuleSet`,
so changing `RULES` or a cap rewrites what the app tells people about itself; there is no
prose to forget to update. Rule violations travel to the browser as a code plus its
parameters, and get said in the reader's language, falling back to the English message
for a code the dictionary has not learnt yet.

Profile pictures are optional and stored in the database as a BLOB. The browser squares
and shrinks them to 512px before upload; the server ignores the claimed content type and
sniffs the magic bytes, capping at 2 MB. `/avatar/:id?v=` is cache-busted by the upload
timestamp and stays behind the personal-link gate, because a face with a name on it is
exactly the sort of thing that should not be public.

### Where this differs from the spec

The spec was written for six friends who nearly all turn up. The real group is 22 with a
dedicated core of about seven, which breaks two of its assumptions.

**The room picks from a shortlist every week, not only on ties.** §6.1 sends a week to a
runoff only when the top scores are equal. Here the top `shortlistSize` films (3) always go
to the room, and whoever is there picks one. Points decide who the candidates are; being
there decides what gets watched.

This is §7's own reasoning extended: "being in the room breaks a tie, it does not buy
influence" becomes "points buy candidacy, presence buys the choice." Nobody is punished for
being away, which is what §14 objects to. An absent person still nominates, still spends
every point, still campaigns, and still decides what is a candidate. They just do not pick
the film for a room they are not in.

It degrades safely. Zero flash votes falls back to the §3.2 ordering, which picks the
highest-scoring film, exactly as before. If nobody opens `/host`, the room vote expires
three hours later and the scheduler resolves it the same way. The shortlist is the strict
top N of the §3.2 ordering, so a film never loses a slot to a coin flip.

It is also how we find out who actually comes: before this, attendance was only recorded
during a tie, so there was no data to reason about.

**`bankCap` is 6, not 12.** With 22 people issuing 44 points a week and a core spending
maybe 14 of them, a full 12-point bank let one person who never comes outvote everything
the room did that week. Halving the cap keeps patient campaigning possible while limiting
the stockpile. If it still distorts things, `RULES=rolling` removes banking entirely.

Both are one-line changes in `src/lib/server/rules.ts`, and revisiting them after about
eight weeks with `/history` open is the plan. The rules screen reads its numbers from the
active rule set, so it will follow either change without an edit.

Two invariants worth keeping in mind when changing anything:

1. **Scores are derived, never accumulated.** `film.score` is a cache, and `rescoreAll()`
   is its only writer. It rebuilds every row wholesale inside the mutating transaction, so
   it cannot half-drift. Switching `RULES` and restarting is enough to rescore everything.
2. **Flash votes never touch `ballot`.** Being in the room breaks a tie; it does not buy
   influence. `runoff_ballot` is a separate table on purpose.

## Deployment

The app runs as a systemd service on **chungus-1** (`54.37.234.58`), which also terminates
TLS with Caddy.

```sh
./deploy/deploy.sh          # rsync, npm ci, build, restart
```

Native modules are compiled on the target, so `node_modules` is never rsynced.

| Thing | Where |
|---|---|
| code | `/opt/filmnight` (owned by the `filmnight` system user) |
| database | `/var/lib/filmnight/filmnight.db` (WAL) |
| environment | `/etc/filmnight.env` (0640 root:filmnight, holds the TMDB token) |
| service | `filmnight.service`, `Restart=always`, listens on `127.0.0.1:3010` |
| backups | `filmnight-backup.timer`, nightly 04:17, 30 days in `/var/backups/filmnight` |
| proxy | `/etc/caddy/Caddyfile`, block for `film.tymek.me` |

### Moving to bigchungus

chungus-1 already reverse-proxies other subdomains to bigchungus over Tailscale, so the
move is three steps:

1. `HOST=bigchungus ./deploy/deploy.sh` after provisioning the same user, dirs and
   `/etc/filmnight.env` there.
2. Copy the database across while the service is stopped:
   `sudo systemctl stop filmnight` on chungus-1, then
   `sqlite3 /var/lib/filmnight/filmnight.db ".backup /tmp/fn.db"` and scp it over.
3. In `/etc/caddy/Caddyfile`, change `reverse_proxy localhost:3010` to
   `reverse_proxy bigchungus:3010`, then `sudo systemctl reload caddy`.

`ORIGIN` stays `https://film.tymek.me`, so every personal link keeps working.

### Handing out links

`npm run seed` is safe to re-run: it never reissues a token for someone who already
exists, so it only prints links for people it just created. To add someone later, put
their name in `src/lib/server/roster.ts`, deploy, and run the seed again.

If someone loses their link, they cannot recover it themselves. Send it again from the
table below, or have them open `/me` on a device that still works and rotate.

**These links are identities. Anyone holding one is that person.** Keep this repository
private, and rotate from `/me` if one leaks.

The links themselves live in `data/identity-links.md`, which git never sees.

### The archive

Weeks 1 to 46 are the film nights that happened before the app existed, loaded by
`scripts/backfill.ts` in August 2026. They are credited to `archiwum`, a person row with
`active = 0`, which keeps them out of the room vote, the host list and the fairness table
while still satisfying `film.added_by`. Their `final_score` is NULL, because nobody spent
anything on them, and the watched grid omits the score rather than showing a zero.

`rules_change` stays on week 1 on purpose. The backfill renumbers the then-only week from
1 to 47 to make room for history, and carrying that row forward would have made the app
announce a rule change that never happened.

The script is a one-off and refuses to run against a database that does not have exactly
one week numbered 1, so it cannot be applied twice.

### Changing the rules

Edit `RULES` in `/etc/filmnight.env` (`ledger`, `rolling`, or `banked`) and restart. Every
score is recomputed from the ballots on the next tick, banks are preserved but ignored
when the rule set does not bank, and the change is announced on the page for that week.

## Operational notes

- The scheduler is in-process and wakes every minute. Closing a week is idempotent and
  guarded by `BEGIN IMMEDIATE`, so a restart mid-close cannot double-resolve.
- Closing a week leaves it in `status='runoff'` while the room picks, and the next week
  does *not* open until that resolves, either from `/host` or automatically three hours
  later. Voting and nominating are blocked for those three hours, by design: it is film
  night.
- On Thursday someone should open `/host` and project the QR. Nothing breaks if nobody
  does; the highest-scoring film simply wins at 23:00.
- Uploads need `BODY_SIZE_LIMIT` above adapter-node's 512K default; the unit sets 3M.
  If you reinstall the service file, run `sudo systemctl daemon-reload`.
- Columns added after the first deploy are listed in `ADDED_COLUMNS` and applied on every
  open, guarded on `PRAGMA table_info`. Adding a column is the only migration shape that
  is supported; anything else needs doing by hand, so back up first.
- `journalctl -u filmnight -f` for logs.
- Restoring a backup: stop the service, copy the dated file over
  `/var/lib/filmnight/filmnight.db`, delete any `-wal`/`-shm` beside it, start again.

This product uses the TMDB API but is not endorsed or certified by TMDB.
