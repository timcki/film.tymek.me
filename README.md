# Wieczorki filmowe

A webapp to manage a weekly film night for my friend group. Everyone nominates one film
a week and gets three voting points that expire unspent. Film scores fade a quarter every
week, so a film nobody keeps backing quietly falls off the list. On Thursday the top three
go to whoever actually turned up in person that given week, and the room picks one. Showing up earns XP and
film-buff ranks.

Polish by default, English on a toggle. Live at **[film.tymek.me](https://film.tymek.me)**,
behind a personal link. There is also a public demo at **[demo.film.tymek.me](https://demo.film.tymek.me)** with an
anonymised copy of the live database, rebuilt every hour. The names, pfps and comments are obfuscated.

<p align="center">
  <img src="docs/screenshots/list.png" alt="The film list" width="30%">
  <img src="docs/screenshots/ballot.png" alt="The ballot on a phone, after scanning the room's QR code and ranking the three films" width="30%">
  <img src="docs/screenshots/me.png" alt="A profile" width="30%">
</p>

<p align="center">
  <img src="docs/screenshots/room.png" alt="The projector view while the room votes: QR code, room code and the three films" width="32%">
  <img src="docs/screenshots/count.png" alt="The projector view counting the votes" width="32%">
  <img src="docs/screenshots/host.png" alt="The projector view once the count is done" width="32%">
</p>

## Stack

SvelteKit 2, Svelte 5 runes, the db is a simple sqlite instance. Auth is done through custom login links that get saved to browser storage.
It's a flake, so a release is a push and a `nixos-rebuild`. It uses the TMDB api for movie lookups.

All the info about running is in `docs/` and `CLAUDE.md` (there's script to bootup test servers through tailscale etc). Point your agents to it and they should figure things out (:
