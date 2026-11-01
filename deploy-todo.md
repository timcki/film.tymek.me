# film.tymek.me - deploy checklist

1. Take a backup on bigchungus:
   `sudo filmnight-snapshot > ~/filmnight-before-update.db`
2. Merge the PRs into `main` in this order (each one sits on top of the previous):
   1. `watched-record`
   2. `admin-panel`
   3. `stats-more`
   4. `fixes`
   5. `custom-weeks`
   6. `no-winner-xp`
   7. `looks` (Święta, PRL and Slavic folk)

   `mock-data` is a dev tool on top of `custom-weeks` and never merges.
3. Deploy with `ssh bigchungus switchn` (or wait for the 04:30 rebuild), then check
   `curl -s https://film.tymek.me/healthz` shows the new commit.
4. Nothing to migrate by hand: the new database columns add themselves on start.
5. Once, fill in production countries for the old films (the stats map needs them). From a
   checkout of `main` with Node 24 and `npm ci`, as a user that can write the database
   (the TMDB token is the one in `/etc/filmnight.env`):

   ```sh
   export TMDB_READ_TOKEN=... DATABASE_PATH=/var/lib/filmnight/filmnight.db
   npm run countries               # dry run: lists what it would fill
   npm run countries -- --commit   # writes; running it again finds nothing to do
   ```

6. After `no-winner-xp` lands, everyone's XP drops by 3 per winner they backed, on the
   first scheduler tick after start. Some people may lose a level; changelog entry 8
   tells them why.
7. The site look no longer switches itself on. If you want e.g. Halloween, pick it in
   Panel → Kalendarz → Wygląd strony.
