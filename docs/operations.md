# Running film.tymek.me

Everything in here is for the person who operates the box. The public-facing summary is
in `README.md`; the rules are in `filmnight-spec.md`.

## Deployment

The app runs as a systemd service on **bigchungus**, a NixOS box on the tailnet.
chungus-1 (`54.37.234.58`) owns the certificate for `film.tymek.me` and reverse proxies
to `bigchungus:3010`, the same way it does for the other subdomains.

This repository is a flake, so a deploy is a push and a rebuild. Nothing is built on the
box by hand and nothing is rsynced:

```sh
jj bookmark set main -r @- && jj git push --remote origin --bookmark main
ssh bigchungus
cd ~/.config/nix && nix flake update filmnight    # point the lock at the new commit
sudo nixos-rebuild switch --flake .#bigchungus --impure
```

`nix/package.nix` pins the build to the same `nodejs_24` the service runs. Its source
filter is an allowlist, which keeps this file, the README and the prototypes out of the
store, which is world readable.

| Thing | Where |
|---|---|
| code | a store path, from the `filmnight` flake input of the nix config |
| service | `modules/services/filmnight.nix` in `~/.config/nix`, `Restart=always` |
| database | `/var/lib/filmnight/filmnight.db` (WAL) |
| environment | `/etc/filmnight.env` (0640 root:filmnight): `ORIGIN`, `RULES`, `TZ`, TMDB token |
| backups | `filmnight-backup.timer`, nightly 04:17, 30 days in `/var/backups/filmnight` |
| proxy | chungus-1 `/etc/caddy/Caddyfile`, `film.tymek.me` to `bigchungus:3010` |
| firewall | 3010 is open on `tailscale0` only, so only chungus-1 can reach it |

`PORT`, `HOST`, `BODY_SIZE_LIMIT` and `ADMINS` are set in the module rather than the
environment file. Nothing may appear in both: systemd applies `EnvironmentFile` after
`Environment`, so the file would silently win.

`ORIGIN` stays `https://film.tymek.me`, so every personal link keeps working.

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
- Restoring a backup: stop the service, copy the dated file over
  `/var/lib/filmnight/filmnight.db`, delete any `-wal`/`-shm` beside it, start again.
