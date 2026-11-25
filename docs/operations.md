# Running film.tymek.me

Everything in here is for the person who operates the box. The public-facing summary is
in `README.md`; the rules are in `filmnight-spec.md`.

## Deployment

The app runs as a systemd service on **bigchungus**, a NixOS box on the tailnet.
chungus-1 (`54.37.234.58`) owns the certificate for `film.tymek.me` and reverse proxies
to `bigchungus:3010`, the same way it does for the other subdomains.

**Pushing `main` here is the deploy.** Nothing is built on the box by hand and nothing is
rsynced. bigchungus rebuilds itself nightly at 04:30 from the nix config on tangled, and
that rebuild resolves this flake to whatever `main` is at the time:

```sh
jj bookmark set main -r @- && jj git push --remote origin --bookmark main
```

To apply it now rather than at 04:30, `ssh bigchungus switchn`, which builds the same
pushed configuration with the same override. Either way, ask what landed:

```sh
curl -s https://film.tymek.me/healthz
# {"ok":true,"rev":"323dedee…","rules":"weekly","demo":false,"db":"ok"}
```

`rev` is the commit the running process was built from, out of the flake input the store
path was built from. Compare it with `jj log`: if they differ the deploy did not happen,
whatever the terminal said at the time. `/healthz` is outside the gate, because a check
only the people behind the gate can make is one nobody makes.

### Why there is no `nix flake update filmnight` any more

There used to be, and it was a trap. The box follows
`git+https://tangled.org/tymek.me/nix`, so the lock **committed there** is the only lock
it reads, while `switchn` used to build the working copy on the box. Running
`nix flake update filmnight` in that working copy and switching therefore produced a
deploy that worked until 04:30 and then silently reverted to the committed pin. That is
how the stats screen and the whole demo sat unbuilt for a fortnight with a working copy
insisting otherwise, and the shape of it would repeat for any input.

So `filmnight` is not pinned for this box. Both the nightly upgrade and `switchn` pass
`--override-input filmnight` at this repository and take `main`, and `switchn` builds the
pushed configuration rather than the working copy, so there is one source of truth and
an unpushed change cannot masquerade as a deploy.

What makes following `main` unattended safe is `doCheck` in `nix/package.nix`: the
acceptance suite and `svelte-check` run inside the build. A revision that fails either
produces no store path, so it cannot become the running system; the upgrade fails, the
previous system keeps serving, and the failure is reported. A red `main` is a deploy that
does not happen, not a broken one.

**To pin deliberately** — a rollback, or holding a revision back — drop the
`--override-input` flag in `modules/machines/bigchungus.nix` and pin the lock as before,
committed and pushed with the rest of the config.

`nix/package.nix` pins the build to the same `nodejs_24` the service runs. Its source
filter is an allowlist, which keeps this file, the README and the prototypes out of the
store, which is world readable. `tests/` is in the allowlist because `doCheck` reads it;
nothing in it is private, and it stays out of the installed output either way.

The demo is a second unit in the same configuration, so that one rebuild moves both and
the demo can never be running older code than the app. What it does not share is the
database; see **The demo**.

| Thing | Where |
|---|---|
| code | a store path, built from this repository's `main` at rebuild time |
| service | `modules/services/filmnight.nix` in `~/.config/nix`, `Restart=always` |
| database | `/var/lib/filmnight/filmnight.db` (WAL) |
| poster cache | `/var/lib/filmnight/posters`, beside the database; not backed up |
| environment | `/etc/filmnight.env` (0640 root:filmnight): `ORIGIN`, `RULES`, `TZ`, TMDB token |
| revision | `FILMNIGHT_REV` in the unit, from the flake input; read back at `/healthz` |
| backups | `filmnight-backup.timer`, nightly 04:17, 30 days in `/var/backups/filmnight` |
| snapshots | `sudo filmnight-snapshot`, a `.backup` streamed to stdout; wheel, plus `snapshotUsers` (`amp`) |
| proxy | chungus-1 `/etc/caddy/Caddyfile`, `film.tymek.me` to `bigchungus:3010` |
| firewall | 3010 is open on `tailscale0` only, so only chungus-1 can reach it |

`PORT`, `HOST`, `BODY_SIZE_LIMIT`, `ADMINS` and `FILMNIGHT_REV` are set in the module
rather than the environment file. Nothing may appear in both: systemd applies
`EnvironmentFile` after `Environment`, so the file would silently win.

`ORIGIN` stays `https://film.tymek.me`, so every personal link keeps working.

### When something breaks

Nothing on the box used to say so. `filmnight-demo-refresh` failed every hour for four
days without a word, which is the same class of problem as the silent revert: the failure
was discoverable and nobody was told.

Every unit here now carries `onFailure = [ "unit-failure@%n.service" ]`, which records
what failed and when, and the shell greeting on bigchungus prints anything outstanding at
login, along with a deploy that is behind. `unit-failure@` is the only place that knows
how a failure is delivered, so adding push is a change in one file; see
`modules/services/unit-failure.nix` in the nix config. `unit-failures` lists what is
outstanding, and `unit-failures --clear` empties the spool once it has been dealt with.
## Handing out links

On the box the seed is `sudo -u filmnight filmnight-seed`, a wrapper the module installs
that reads `/etc/filmnight.env` for you. It is safe to re-run: it never reissues a token
for someone who already exists, so it only prints links for people it just created. To add
someone later, put their name in `src/lib/server/roster.ts`, deploy, and seed again.

If someone loses their link, they cannot recover it themselves. Send it again from
`data/identity-links.md`, or have them open `/me` on a device that still works and rotate.

**These links are identities. Anyone holding one is that person.** They are kept in
`data/identity-links.md`, which is gitignored and never leaves this machine; rotate from
`/me` if one leaks. That file is a copy, not the source: the database is, and anyone who
has rotated from `/me` since it was written will not match. Read a current link out of
`person.token` rather than trusting it.

## Changing the rules

Edit `RULES` in `/etc/filmnight.env` (`weekly`, `ledger`, `rolling`, or `banked`; the
default is `weekly`) and restart. Every score is recomputed from the ballots on the next
tick, banks are preserved but ignored when the rule set does not bank, and the change is
announced on the page for that week.

The two places where this deployment departs from `filmnight-spec.md` are both one-line
changes in `src/lib/server/rules.ts`, and revisiting them after about eight weeks with
`/history` open is the plan:

**The room picks from a shortlist every week, not only on ties.** §6.1 sends a week to a
runoff only when the top scores are equal. Here the top `shortlistSize` films (3) always
go to the room. Points decide who the candidates are; being there decides what gets
watched. This is §7's own reasoning extended, and it degrades safely: zero flash votes
falls back to the §3.2 ordering and picks the highest-scoring film, exactly as before.

**`bankCap` is 6, not 12.** With 22 people issuing 44 points a week and a core spending
maybe 14 of them, a full 12-point bank let one person who never comes outvote everything
the room did that week. `RULES=rolling` removes banking entirely if it still distorts
things.

## The archive

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

Anything watched together that no round decided, a cinema trip or a night nobody logged,
is written down on the admin **Obejrzane** tab with a date rather than a week. It becomes
an archival `watched` film in the round that date falls in and never touches
`week.winner_film_id`. A regular night must fall in a round whose night has passed and
has no film yet. An outing (`film.outing`, dated by `film.watched_at`) can be any day in
the past and takes its own evening number. Outings count in history and in the film
statistics, but never as a win for whoever suggested them: no nominator XP, no fairness
night.

## The demo

<https://demo.film.tymek.me> is this same code, run by a second service against a
database with nobody real in it, so the app can be linked from a portfolio without
handing a stranger twenty-two people's names, faces and comments.

The privacy here is by absence, not by masking. Names reach the browser from seven or
eight places, and a masking layer inside the live app would have to catch every one of
them forever. Instead the demo's process opens a file that never had any of it:
`scripts/anonymise.ts` rewrites a snapshot into made-up people, drops the avatars,
swaps every line of free text for lorem ipsum, and vacuums, so the old bytes are not
even in the freed pages. What stays real is the part worth showing: titles, posters,
directors, every score, every ballot, the whole week history including the archive, XP,
ranks, the fairness table and the rule set.

The demo keeps the gate. Its root answers a visitor holding nothing with the same
locked-out page the real app does, because being invite-only is the thing that shapes
everything behind it, and a showcase that opened straight onto the app would be hiding
the reason it looks the way it does. `/demo` is the door: it hands over one of the
made-up people and redirects to the root, and it is the only place that hands anybody
anything. Link the portfolio at `/demo` rather than at the root, or at
`/demo/as?who=admin` to open on the back office. Somebody already carrying a persona
keeps it when they pass the door again; the bar is what swaps who you are.

The filler is lorem ipsum rather than plausible film talk on purpose. Invented opinions
in the right register read as twenty-two real people's, and a visitor has no way to tell
which half of a comment thread was made up; filler that announces itself has no such
problem. The demo also opens in English, since whoever a portfolio sends is being shown
the app rather than using it, and the language switch still works from there.

It is a subdomain rather than `/demo` on the real one because SvelteKit's `base` is
fixed at build time: every internal link would walk out of a path prefix straight into
the gated app, and `origin()` would put the wrong host into the QR codes.

Both units live in `modules/services/filmnight.nix` in `~/.config/nix`, which is not this
repository, so they are described here rather than checked in.

### The service

`filmnight-demo`, alongside `filmnight` and pointed at the same store path:

| Setting | Value |
|---|---|
| `PORT` | `3011` |
| `DATABASE_PATH` | `/var/lib/filmnight-demo/demo.db` |
| `ORIGIN` | `https://demo.film.tymek.me` |
| `DEMO` | `1` |
| `RULES` | the same value as production, or the rules screen describes a different app |
| `TMDB_READ_TOKEN` | the same token; `/api/search` is rate limited per address in demo |
| `ADDRESS_HEADER` | `X-Forwarded-For` |
| `XFF_DEPTH` | `1` |
| `FILMNIGHT_REV` | the same commit as the app; `demo.film.tymek.me/healthz` reads it back |
| `ADMINS` | **unset** |

`PORT`, `HOST`, `DATABASE_PATH`, `DEMO`, `ADDRESS_HEADER`, `XFF_DEPTH` and
`FILMNIGHT_REV` live in the unit. `ORIGIN`, `RULES`, `TZ` and the TMDB
token live in `/etc/filmnight-demo.env` (0600 root:root), the last three copied out of
`/etc/filmnight.env` so the demo describes the same rule set the real app runs. Nothing
may appear in both, for the reason it may not for the app: `EnvironmentFile` wins over
`Environment`.

`ADMINS` is deliberately absent. The anonymiser preserves `is_admin`, so the demo already
has an admin to switch to, and the ids in `ADMINS` do not exist in that database anyway.

Its firewall rule is the same shape as the app's: 3011 open on `tailscale0` only, so
chungus-1 is the only thing that can reach it. It gets no backup timer; there is nothing
in it worth keeping.

`ADDRESS_HEADER` is what makes the two ceilings in the demo mean anything. Without it
adapter-node reports the socket peer, which behind Caddy is Caddy: every visitor would
share one bucket and one person's clicking would lock out the next. Caddy's
`reverse_proxy` sets `X-Forwarded-For` itself, and `XFF_DEPTH` is 1 because chungus-1 is
the only hop in front. Both ceilings are generous enough that a person clicking around
never meets them: 20 TMDB searches and 40 writes a minute. Searches have a second,
shared ceiling of 60 a minute across every visitor, so the demo cannot spend the key the
real app depends on however many addresses it is visited from.

Nothing in the demo needs `BODY_SIZE_LIMIT` raised, because uploads are refused there.
The in-process scheduler runs as usual, so a demo week really does close and a runoff
really does resolve; the hourly rebuild simply puts it back.

### What a visitor may write

A visitor is handed a made-up person, so every action in the app is open to them and
that is the point: voting, nominating, commenting and the back office all work, and the
hourly rebuild takes it back. Two things they may not do, and one they may not choose.

Avatars are refused, because a stranger's picture would sit on somebody's face for an
hour. Rolling a link is refused, because the demo's people are shared and one visitor
rotating a persona would drop everyone else reading over that shoulder back to the
default one. And a poster may only be a `https://image.tmdb.org/t/p/` URL: it is the one
field a person hands us that every reader's browser then goes and fetches, so leaving it
open would let whoever filled the form pick both what the page shows and who gets told
about each visitor. That last one is enforced for everybody, demo or not, since nothing
but the TMDB picker was ever supposed to fill it.

Free text is bounded rather than refused, because a demo nobody can type into is not
worth showing: a comment is 280 characters, a note 160, a title 200 and a summary 2000,
all of which the real app was already living inside. What a visitor writes stands under
a made-up name until the next rebuild, and the write ceiling is what keeps that to a
line or two rather than a wall.

### The refresh

`filmnight-demo-refresh.timer`, hourly, running the service below as root. Give the unit
`RuntimeDirectory=filmnight-demo-refresh` with mode `0700`, so the snapshot of the real
database spends its short life in `/run` and never in a directory the demo user can read:

```sh
set -euo pipefail
work=/run/filmnight-demo-refresh
trap 'rm -f "$work"/*' EXIT

sqlite3 /var/lib/filmnight/filmnight.db ".backup '$work/snapshot.db'"
"$node" "$anonymise" "$work/snapshot.db" "$work/next.db"

install -o filmnight-demo -g filmnight-demo -m 0640 "$work/next.db" \
    /var/lib/filmnight-demo/demo.db
rm -f /var/lib/filmnight-demo/demo.db-wal /var/lib/filmnight-demo/demo.db-shm
systemctl restart filmnight-demo
```

`$node` and `$anonymise` are Nix interpolations of `${nodejs_24}/bin/node` and
`${filmnight}/lib/filmnight/anonymise.mjs`: the same node and the same store path the
service itself runs from. `nix/package.nix` bundles the script beside `seed.mjs`.

`.backup` is safe against the live WAL writer and never writes to production. Everything
after it is `set -e`, and that is the whole failure contract: the anonymiser writes no
output at all unless its verification passed, so a failed run swaps nothing in and
restarts nothing, and the previous demo database keeps serving. A stale demo is fine. A
leaking one is not.

The one false alarm worth knowing about: the verification looks for every source name in
every column, and `tmdb_cache`, `tmdb_movie` and `film.overview` are left alone because they are public
film data. A director or a synopsis that happens to contain somebody's full name will
therefore stop the run and name the column it found it in. That is the check working; the
call about what to do with it is yours.

The `-wal` removal matters for the same reason it does in `deploy/test-local.sh`: a
journal left beside the new file belongs to the database it replaced, and SQLite would
replay it over the fresh copy.

Because a failed run is silent by design, the unit carries `onFailure`: an hour of
staleness is fine and a day of it is not, and the difference between the two used to be
whether anybody happened to look. See **When something breaks**.

### The proxy

On chungus-1, in `/etc/caddy/Caddyfile`, the block in `deploy/Caddyfile.snippet`:

```
demo.film.tymek.me {
	encode zstd gzip
	reverse_proxy bigchungus:3011
}
```

### Trying it first

`./deploy/test-demo.sh` does all of it here: snapshot, anonymise, serve with `DEMO=1`.
`SNAPSHOT=0` re-anonymises the snapshot already on disk. The snapshot and the demo copy
are two different files on purpose, and only the second one is ever served.

## Notes

- The scheduler is in-process and wakes every minute. Closing a week is idempotent and
  guarded by `BEGIN IMMEDIATE`, so a restart mid-close cannot double-resolve.
- Closing a week leaves it in `status='runoff'` while the room picks, and the next week
  does *not* open until that resolves, either from `/host` or automatically three hours
  later. Voting and nominating are blocked for those three hours, by design: it is film
  night.
- On Thursday someone should open `/host` and project the QR. Nothing breaks if nobody
  does; the highest-scoring film simply wins at 23:00.
- Uploads need `BODY_SIZE_LIMIT` above adapter-node's 512K default; the module sets 3M.
  A `nixos-rebuild switch` reloads systemd itself, so there is nothing to do by hand.
- Columns added after the first deploy are listed in `ADDED_COLUMNS` and applied on every
  open, guarded on `PRAGMA table_info`. Adding a column is the only migration shape that
  is supported; anything else needs doing by hand, so back up first.
- `journalctl -u filmnight -f` for logs.
- Phones get posters from `/poster/...`, which fetches each film's TMDB poster once into
  `posters/` beside the database and serves it from disk after that. Only posters a film
  in the database wears are kept; anything else is redirected to TMDB, and so is a poster
  the server failed to fetch, so the directory is safe to delete at any time and refills
  itself. Film details are kept for 30 days in `tmdb_movie` and searches for a week in
  `tmdb_cache`, so the TMDB key is spent on new films rather than on the same ones again.
  `[tmdb] ... failed: TMDB responded 429` in the log is the key being rate limited.
- Restoring a backup: stop the service, copy the dated file over
  `/var/lib/filmnight/filmnight.db`, delete any `-wal`/`-shm` beside it, start again.
- The statistics map reads `film.countries`, which TMDB fills on the way in for every film
  added since it existed. The films from before it need one pass of
  `TMDB_READ_TOKEN=... DATABASE_PATH=... npm run countries` (a dry run; add `-- --commit`
  to write). It only touches rows with a TMDB id and no countries yet, so a second run
  finds nothing to do. Try it on a snapshot first, and take a backup before pointing it
  at production.
- An admin can also take a copy from the panel: Ludzie → Kopia zapasowa, served by
  `/admin/backup` as `db.serialize()`, logged as `site.backup`, and off in the demo. It
  holds every personal link, so it is the same thing as `data/identity-links.md` and
  stays off anything shared. A downloaded copy restores the same way as a dated one.
