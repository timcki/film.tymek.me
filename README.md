# Film Night

A private weekly film-voting site. One nomination each per week, a budget of voting
points each per week, highest-scoring film gets watched on Thursday, ties are broken by
the people who actually turned up.

Implements `filmnight-spec.md`. SvelteKit 2 + Svelte 5 runes + better-sqlite3, served by
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

`npm test` runs the acceptance suite (§11 of the spec, 54 tests). `npm run check`
typechecks.

## How it fits together

| Path | What it does |
|---|---|
| `src/lib/server/rules.ts` | the three rule sets, scoring, budgets, ordering, `titleKey` |
| `src/lib/server/scoring.ts` | scores derived from the ballot table; `rescoreAll()` |
| `src/lib/server/weeks.ts` | `closeWeek`, attrition, bank accrual, `finish` |
| `src/lib/server/runoffs.ts` | flash votes, tally, `closeRunoff` |
| `src/lib/server/films.ts` | `setPoints`, `nominate`, `renominate`, standings |
| `src/lib/server/scheduler.ts` | the minute tick that closes weeks and expired runoffs |
| `src/hooks.server.ts` | cookie identity; everything but `/u/:token` and `/f/:code` needs it |

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

### Changing the rules

Edit `RULES` in `/etc/filmnight.env` (`ledger`, `rolling`, or `banked`) and restart. Every
score is recomputed from the ballots on the next tick, banks are preserved but ignored
when the rule set does not bank, and the change is announced on the page for that week.

## Operational notes

- The scheduler is in-process and wakes every minute. Closing a week is idempotent and
  guarded by `BEGIN IMMEDIATE`, so a restart mid-close cannot double-resolve.
- A tie leaves the week in `status='runoff'` and the next week does *not* open until the
  runoff closes, either from `/host` or automatically three hours after it was created.
- `journalctl -u filmnight -f` for logs.
- Restoring a backup: stop the service, copy the dated file over
  `/var/lib/filmnight/filmnight.db`, delete any `-wal`/`-shm` beside it, start again.

This product uses the TMDB API but is not endorsed or certified by TMDB.
