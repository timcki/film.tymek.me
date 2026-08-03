# Film Night — implementation spec

A private weekly film-voting site for a group of six friends in Kraków. One nomination
each per week, a budget of voting points each per week, highest-scoring film gets watched
on Thursday, ties are broken by the people who actually turned up.

Target stack: **SvelteKit 2 + Svelte 5 (runes) + better-sqlite3**, deployed as a Node
service on a VPS behind Caddy. No email, no push, no third-party auth.

This document is written to be handed to a coding agent. Sections 3–5 are the parts that
must be implemented exactly; everything else has room for judgement.

---

## 1. Principles

1. **Six people who trust each other.** The threat model is a friend voting twice as a
   joke, not an attacker. Every security decision should be the cheapest thing that makes
   the honest path frictionless.
2. **No passwords, no accounts, no email.** Identity is a secret URL.
3. **The rules are configuration, not code.** Three rule sets ship; one is active at a
   time; switching is a config change plus a rescore, never a migration.
4. **The server is the only authority.** Budgets, deadlines and duplicate checks are
   enforced server-side. The client is a convenience.
5. **Nothing is ever deleted.** Films get archived or dropped, never removed. History is
   permanent and public within the group.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Person** | One of the six. Has a permanent secret token. |
| **Week** | A voting cycle. Opens the moment the previous one closes, closes Thursday 20:00 Europe/Warsaw. |
| **Nomination** | Adding a film to the list. One per person per week, free, doesn't bank. |
| **Ballot** | Points a person has put on a film in a given week. |
| **Score** | A film's current standing, computed from ballots per the active rule set. |
| **Runoff** | The in-room tie-break: a QR code, one flash vote per person present. |
| **Flash vote** | A vote cast in a runoff. Decides the night only; never affects scores. |
| **Bank** | A person's stored unspent points. Only exists in the `banked` rule set. |

---

## 3. Rule sets

Exactly one is active, chosen by `RULES` in the environment. Default `banked`.

```ts
// src/lib/server/rules.ts

export type RuleSetId = 'ledger' | 'rolling' | 'banked';

export type RuleSet = {
  id: RuleSetId;
  label: string;
  /** points granted to each person at the start of each week */
  pointsPerWeek: number;
  /** if true, unspent points carry over into the next week */
  banking: boolean;
  /** maximum bank balance; ignored when banking is false */
  bankCap: number;
  /** how a film's score is computed */
  scoring: 'total' | 'decay';
  /** only used when scoring === 'decay' */
  decayFactor: number;
  /** what happens to films nobody is voting for */
  attrition:
    | { kind: 'archive'; afterWeeksAtZero: number }   // hidden but revivable by a vote
    | { kind: 'drop'; afterWeeksWithoutPoints: number }; // removed; revivable only by re-nomination
  nominationsPerWeek: number;
};

export const RULE_SETS: Record<RuleSetId, RuleSet> = {
  ledger: {
    id: 'ledger',
    label: 'Ledger',
    pointsPerWeek: 1,
    banking: false,
    bankCap: 0,
    scoring: 'total',
    decayFactor: 0,
    attrition: { kind: 'archive', afterWeeksAtZero: 8 },
    nominationsPerWeek: 1
  },
  rolling: {
    id: 'rolling',
    label: 'Rolling',
    pointsPerWeek: 5,
    banking: false,
    bankCap: 0,
    scoring: 'decay',
    decayFactor: 0.5,
    attrition: { kind: 'drop', afterWeeksWithoutPoints: 1 },
    nominationsPerWeek: 1
  },
  banked: {
    id: 'banked',
    label: 'Banked',
    pointsPerWeek: 2,
    banking: true,
    bankCap: 12,
    scoring: 'total',
    decayFactor: 0,
    attrition: { kind: 'drop', afterWeeksWithoutPoints: 2 },
    nominationsPerWeek: 1
  }
};
```

### 3.1 Scoring

```ts
/**
 * points[filmId][weekNumber] -> integer
 * currentWeek is the week being scored (usually the open one)
 */
export function score(rules: RuleSet, points: Map<number, number>, currentWeek: number): number {
  if (rules.scoring === 'total') {
    let sum = 0;
    for (const p of points.values()) sum += p;
    return sum;
  }
  // 'decay' — deliberately a two-week window, not a recursive EMA.
  // Simulation showed the two forms are indistinguishable in outcome, and this
  // one is stateless: it can always be recomputed from the ballot table alone.
  return (points.get(currentWeek) ?? 0) + rules.decayFactor * (points.get(currentWeek - 1) ?? 0);
}
```

Scores are **always derived from the ballot table**, never stored as a mutable running
total. A `score` column may exist as a cache but must be recomputable by a single
`rescoreAll()` function, which is what runs after a rule-set change.

### 3.2 Ordering

Films are ordered by:

1. `score` descending
2. `added_week` ascending — the film that has been waiting longer wins
3. `created_at` ascending
4. `id` ascending

This ordering is used for the list, for picking the winner, and for resolving a runoff
that is itself tied. It is total and deterministic; there is never a coin flip.

### 3.3 Budgets

```ts
export function budget(rules: RuleSet, bankBalance: number): number {
  return rules.banking ? bankBalance : rules.pointsPerWeek;
}
export function remaining(rules: RuleSet, bankBalance: number, spentThisWeek: number): number {
  return budget(rules, bankBalance) - spentThisWeek;
}
```

`bank.balance` holds the **start-of-week** balance. It is not decremented as points are
spent; `remaining` is computed. On week close:

```ts
balance = Math.min(rules.bankCap, balance - spentThisWeek + rules.pointsPerWeek);
```

A person joining mid-run starts with `pointsPerWeek`.

When `banking` is false, `bank.balance` is ignored entirely (leave the rows, don't delete
them — switching rule sets must not lose data).

### 3.4 Attrition

Evaluated once, during week close, **after** the winner has been removed.

- `archive`: a film with **zero total points** whose age (`currentWeek - added_week`)
  is `>= afterWeeksAtZero` moves to `status='archived'`. Archived films are hidden from the
  main list but shown in a fold-out, and **a single vote returns them to `active`**.
- `drop`: a film that received **no points in the last `afterWeeksWithoutPoints` weeks**
  moves to `status='dropped'`. There is no grace week for newly nominated films — this is
  faithful to the rule as written, and it means your nomination survives only if someone
  (usually you) votes for it. Dropped films appear in the same fold-out with a
  **Re-nominate** button, which creates a *new* film row starting from zero and consumes
  the re-nominator's nomination slot for that week.

---

## 4. Data model

SQLite, WAL mode, foreign keys on. Timestamps are ISO-8601 UTC strings.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE person (
  id          TEXT PRIMARY KEY,          -- slug, e.g. 'tymek'
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL,             -- hex, for avatars
  token       TEXT NOT NULL UNIQUE,      -- 128-bit base64url secret
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE week (
  number         INTEGER PRIMARY KEY,    -- 1, 2, 3, …
  opens_at       TEXT NOT NULL,
  closes_at      TEXT NOT NULL,          -- Thursday 20:00 Europe/Warsaw, stored as UTC
  status         TEXT NOT NULL,          -- 'open' | 'runoff' | 'closed'
  winner_film_id INTEGER REFERENCES film(id),
  resolved_at    TEXT
);

CREATE TABLE film (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  title_key   TEXT NOT NULL,             -- normalised for duplicate detection, see §4.1
  year        INTEGER,
  director    TEXT,
  tmdb_id     INTEGER,
  poster_url  TEXT,
  overview    TEXT,
  added_by    TEXT NOT NULL REFERENCES person(id),
  added_week  INTEGER NOT NULL REFERENCES week(number),
  status      TEXT NOT NULL DEFAULT 'active', -- 'active'|'archived'|'dropped'|'watched'
  watched_week INTEGER REFERENCES week(number),
  final_score REAL,                      -- score at the moment it was watched
  created_at  TEXT NOT NULL
);

-- one nomination per person per week
CREATE UNIQUE INDEX film_one_per_person_per_week ON film(added_by, added_week);

CREATE TABLE ballot (
  week_number INTEGER NOT NULL REFERENCES week(number),
  person_id   TEXT    NOT NULL REFERENCES person(id),
  film_id     INTEGER NOT NULL REFERENCES film(id),
  points      INTEGER NOT NULL CHECK (points > 0),
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (week_number, person_id, film_id)
);
CREATE INDEX ballot_film ON ballot(film_id);
CREATE INDEX ballot_week ON ballot(week_number);

CREATE TABLE bank (
  person_id  TEXT PRIMARY KEY REFERENCES person(id),
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE runoff (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number    INTEGER NOT NULL REFERENCES week(number),
  code           TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  closed_at      TEXT,
  winner_film_id INTEGER REFERENCES film(id)
);

CREATE TABLE runoff_film (
  runoff_id INTEGER NOT NULL REFERENCES runoff(id),
  film_id   INTEGER NOT NULL REFERENCES film(id),
  PRIMARY KEY (runoff_id, film_id)
);

CREATE TABLE runoff_ballot (
  runoff_id  INTEGER NOT NULL REFERENCES runoff(id),
  voter_key  TEXT    NOT NULL,           -- person id if known, else device uuid
  person_id  TEXT    REFERENCES person(id),
  film_id    INTEGER NOT NULL REFERENCES film(id),
  created_at TEXT    NOT NULL,
  PRIMARY KEY (runoff_id, voter_key)
);

CREATE TABLE tmdb_cache (
  query      TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
```

A ballot row exists only when `points > 0`. Setting points to 0 deletes the row.

### 4.1 Duplicate detection

`title_key` = title lowercased, Unicode NFKD-normalised, diacritics stripped, leading
article (`the |a |an |le |la |el `) removed, all non-alphanumerics removed.
`Sátántangó` → `satantango`. `The Thing` → `thing`.

A nomination is rejected if a film with the same `tmdb_id` (when both have one) **or** the
same `title_key` already exists with status `active` or `archived`, or was already
`watched`. Dropped films do not block — that's what Re-nominate is for.

---

## 5. Identity

### 5.1 The personal link

Each person has a 128-bit token, base64url, e.g. `k3Jf9QwLm2Xb7RtY0aZpNg`.
Their link is `https://<host>/u/<token>`.

`GET /u/:token`:
- look up the person; unknown token → 404 with a plain "this link isn't valid" page
- set cookie `fn_person` = token, `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`,
  `maxAge: 400 days` (the browser cap)
- redirect 303 to `/`

`hooks.server.ts` reads `fn_person`, resolves it to a person, and puts it on
`event.locals.person`. If the cookie is absent or invalid, `locals.person` is `null` and
every route except `/u/:token` and `/f/:code` renders a short page saying "open your
personal link — ask Tymek if you've lost it."

Re-setting the cookie on every request keeps it alive indefinitely for regular visitors.

### 5.2 Adding a second device

The problem: your token lives in a cookie on your laptop; your phone has never seen it.

`/me` shows a **Device QR** encoding your own personal link. Scan it with a phone and the
phone hits `/u/:token`, gets the cookie, and is you permanently — for weekly voting and
for runoffs alike.

This QR must be visually and textually distinguished from the room QR:

| | Device QR (`/me`) | Room QR (`/host`) |
|---|---|---|
| Encodes | your personal link | `https://<host>/f/<code>` |
| Audience | you alone | everyone in the room |
| Safe to project | **never** | yes |

Put a red warning next to the Device QR: *anyone who photographs this becomes you.*

### 5.3 Token rotation

`POST /me/rotate` issues a new token, invalidating the old link, and immediately re-sets
the cookie on the calling device. Use it if a link leaks. Other devices of the same person
will be logged out and need to re-scan — that's correct behaviour.

---

## 6. The weekly cycle

Timezone is **Europe/Warsaw**. The deadline is **Thursday 20:00 local**, which is when
you all sit down; voting closes as the film starts.

Store `closes_at` in UTC, computed from local wall-clock time so that it survives DST —
do not hardcode an offset. Use `Intl.DateTimeFormat` with `timeZone: 'Europe/Warsaw'` or a
tz-aware library; there is a DST change in late March and late October and the deadline
must stay at 20:00 local on both sides.

### 6.1 Closing a week

Triggered by an in-process scheduler that wakes every minute and checks for
`week.status='open' AND closes_at <= now`, and also exposed as `POST /host/close` so the
host can run it early. **Must be idempotent** — guard on `status`, run the whole thing in
one `BEGIN IMMEDIATE` transaction.

```
closeWeek(w):
  if w.status != 'open': return
  standings = active films ordered per §3.2
  if standings is empty or standings[0].score <= 0:
      w.status = 'closed'; w.winner = null
      applyAttrition(w); accrueBanks(w); openWeek(w.number + 1)
      return
  tied = standings.filter(f => f.score == standings[0].score)
  if tied.length > 1:
      create runoff(week=w, films=tied, code=newCode(), expires_at=now+3h)
      w.status = 'runoff'
      return                       // the week stays unresolved until the runoff closes
  finish(w, standings[0])

finish(w, winner):
  winner.status = 'watched'; winner.watched_week = w.number; winner.final_score = score
  w.winner_film_id = winner.id; w.status = 'closed'; w.resolved_at = now
  applyAttrition(w)                // §3.4, after the winner is removed
  accrueBanks(w)                   // §3.3, only when rules.banking
  openWeek(w.number + 1)           // opens_at = now, closes_at = next Thursday 20:00 local
```

Ballots from closed weeks are never modified. They stay in the table forever and are what
scores are computed from.

### 6.2 Rejecting late votes

Any mutation (`vote`, `nominate`, `renominate`) checks `week.status === 'open'` and
`now < closes_at` inside the transaction, and returns a 409 with a clear message
otherwise. Do not trust the client's clock for anything.

---

## 7. The runoff

### 7.1 Creating

`code` is 6 characters from `ACDEFGHJKLMNPQRTUVWXY3479` — no vowels (no accidental words),
no ambiguous glyphs (`0/O`, `1/I/L`, `S/5`, `B/8`, `Z/2`). Unique among open runoffs.

`expires_at` = created + 3 hours.

### 7.2 Voting

`GET /f/:code` is reachable **without a personal link** — this is deliberate, because the
point is that being in the room is the credential.

- If `locals.person` exists, the voter is identified; `voter_key = person.id`.
- Otherwise the page asks *"who are you?"* and shows the six names as buttons. Picking one
  sets `voter_key = person.id` too, but `person_id` is recorded and a
  `fn_device` cookie (random uuid) is also set so the phone is recognised next time.
- If for some reason no name is picked (a seventh person, a guest), `voter_key` is the
  `fn_device` uuid and `person_id` is null.

One row per `(runoff_id, voter_key)`; voting again **replaces** your choice until the
runoff closes. Show a live tally to everyone on the page.

Flash votes are written to `runoff_ballot` and **never** to `ballot`. They do not touch
scores, banks, or attrition. This is the single most important invariant in the runoff:
being in the room breaks a tie, it does not buy influence.

### 7.3 Closing

`POST /host/close-runoff`, or automatically at `expires_at`.

```
winner = runoff films ordered by (flash votes desc, then §3.2 ordering)
```

So zero turnout falls back cleanly to the oldest film, and a tied flash vote does too. Then
run `finish(week, winner)` from §6.1.

### 7.4 The host view

`/host` is a projector-friendly page: big room QR, the code in large monospace, the tied
films, the live tally, a **Close** button, and a row of the six names so the host can cast
on behalf of someone whose phone is dead.

---

## 8. Routes

SvelteKit 2 file-based routing. Mutations are **form actions**, so the site works without
JavaScript; progressive enhancement (`use:enhance`) makes it feel instant.

```
src/routes/
  +layout.server.ts          -> locals.person, active week, rules label
  +page.svelte               -> the list
  +page.server.ts            -> load: standings, my ballots, my budget, my nomination
                                actions: setPoints, nominate, renominate
  u/[token]/+server.ts       -> GET: set cookie, redirect
  me/+page.svelte            -> device QR, rotate token, your stats
  me/+page.server.ts         -> actions: rotate
  f/[code]/+page.svelte      -> flash vote
  f/[code]/+page.server.ts   -> load: runoff + tally; actions: flashVote, identify
  host/+page.svelte          -> projector view
  host/+page.server.ts       -> actions: close, closeRunoff, openRunoffManually
  history/+page.svelte       -> watched films, per-person stats
  api/search/+server.ts      -> GET ?q= -> TMDB proxy
```

### 8.1 `setPoints`

Takes `filmId` and an **absolute** point value, not a delta — deltas are not idempotent
and double-taps on a phone are common.

```
setPoints(person, filmId, points):
  BEGIN IMMEDIATE
  assert week is open and now < closes_at
  assert points >= 0
  spentElsewhere = sum(ballot.points where week, person, film != filmId)
  assert spentElsewhere + points <= budget(person)
  if points == 0: delete ballot row
  else: upsert ballot row
  if film.status == 'archived' and points > 0: film.status = 'active'   // revival
  COMMIT
```

The `assert`s return 409 with a human-readable message; the UI shows it as a toast.

### 8.2 `/api/search`

Server-side proxy so the TMDB key never reaches the browser.

- `GET /api/search?q=stalker`
- Requires a valid `locals.person` (don't proxy for the world).
- Cache in `tmdb_cache` for 24 hours keyed on the normalised query.
- Map results to `{ tmdbId, title, year, poster, thumb, overview }`, first 7 only.
- On any TMDB failure return `{ results: [], degraded: true }` and let the UI say
  "couldn't reach TMDB — you can still type a title by hand". Never block a nomination on
  TMDB being up.
- Fetch `credits` for the director only when a film is actually nominated, not during
  search (that's one extra request per nomination instead of seven per keystroke).

`TMDB_API_KEY` in the environment. Get one free at themoviedb.org → Settings → API;
non-commercial use is free. Attribution ("This product uses the TMDB API but is not
endorsed or certified by TMDB") belongs in the footer.

---

## 9. UI

The prototype (`filmnight.html`) is the visual reference: dark, one column, max width
660px, mobile-first. Reuse its palette and layout. Screens:

**`/` — the list.** Countdown to Thursday 20:00. A status card showing what you've spent,
your budget or bank, and whether your nomination is used. Then the ranked films: poster,
title, year, director, who added it and when, avatars of everyone who has points on it,
the score, and either a Vote button (when `pointsPerWeek === 1`) or a `− n +` stepper.
Below: the nomination box with TMDB autocomplete, the archived/dropped fold-out, watched
history, and a "how this works" fold showing the *active* rule set's rules.

Badges on a film row: an *N-week campaign* badge when one person has backed it for 3+
consecutive weeks, and a *fades/drops* warning when attrition is imminent.

**`/f/:code` — flash vote.** Enormous tap targets, the tied films as full-width cards,
live tally, nothing else. Assume a dim room and someone holding a beer.

**`/host` — projector.** Room QR at least 320px, code in 48px monospace.

**`/me`** — your Device QR with the red warning, rotate button, and your own numbers:
points spent all-time, films you nominated that got watched, longest campaign.

**`/history`** — watched films newest first with their final scores, plus a small table of
who has had how many of their nominations watched. That table is the group's own check on
whether the active rule set is being fair.

---

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Nobody votes all week | No winner. Week closes, nothing watched, next week opens. Say so on the page. |
| Fewer than two films on the list | Fine. One film wins by default if it has any points. |
| Everyone abstains but films have old points (`ledger`) | Highest total still wins — correct, that's the whole mechanic. |
| Person nominates something already watched | Rejected with "we watched that in week 12". |
| Person nominates a dropped film | Rejected; UI points them at the Re-nominate button in the fold-out. |
| Re-nomination | New film row, score starts at zero, consumes the nomination slot. |
| Attendance swings (`rolling`) | Point supply shrinks with attendance, so last week's decayed leader wins by inertia. Known and accepted; documented on the rules fold. |
| DST change | `closes_at` recomputed from local wall time each week. Add a test. |
| Two people share one phone in a runoff | Both can vote — the name picker is per-tap, and the device cookie only pre-fills. |
| Someone's link leaks | `/me/rotate`. |
| Rule set changed mid-run | Rescore everything from ballots. Banks are preserved but ignored when `banking` is false. Announce it on the page for one week. |
| Clock skew on a phone | Irrelevant — the server decides what time it is. |
| Concurrent votes at 19:59:59 | `BEGIN IMMEDIATE` serialises them; the budget check is inside the transaction. |

---

## 11. Acceptance tests

Write these as Vitest tests against an in-memory SQLite instance. They are the definition
of done.

**Budgets**
1. A person cannot spend more than `pointsPerWeek` in a week (all three rule sets).
2. In `banked`, a person cannot spend more than their bank balance.
3. In `banked`, unspent points carry over; the balance never exceeds `bankCap` and never
   goes negative.
4. Setting points to 0 frees the budget for another film in the same week.

**Nominations**
5. A second nomination in the same week is rejected.
6. The unique index rejects it even if the check is bypassed.
7. A duplicate by `tmdb_id` is rejected; a duplicate by `title_key` is rejected;
   `Sátántangó` and `Satantango` collide.
8. Re-nominating a dropped film succeeds, starts at score 0, and consumes the slot.

**Scoring**
9. `ledger`: score equals the sum of all points ever placed.
10. `rolling`: score equals this week's points plus half of last week's, and a film with
    points only three weeks ago scores 0.
11. `banked`: score equals the sum of all points ever placed.
12. `rescoreAll()` after switching rule sets produces the same numbers as a fresh
    computation from ballots.

**Ordering**
13. Two films on equal score order by `added_week` ascending.
14. The ordering is total — no two films ever compare equal.

**Week lifecycle**
15. `closeWeek` on an already-closed week is a no-op.
16. Running `closeWeek` twice concurrently produces exactly one winner.
17. The winner's `final_score` is the score at the moment of closing, not recomputed later.
18. Votes are rejected once `closes_at` has passed.
19. `closes_at` is Thursday 20:00 Europe/Warsaw across both DST boundaries — test with a
    week spanning the last Sunday of March and one spanning the last Sunday of October.

**Attrition**
20. `ledger`: a film at 0 points for 8 weeks becomes `archived`; a single vote makes it
    `active` again.
21. `rolling`: a film with no points this week becomes `dropped`.
22. `banked`: a film needs two consecutive pointless weeks to be `dropped`.
23. Attrition runs after the winner is removed, so the winner is never also archived.

**Runoff**
24. A tie at the top creates a runoff and leaves the week `status='runoff'`.
25. Flash votes never appear in `ballot` and never change any film's score.
26. One flash vote per `voter_key`; voting again replaces it.
27. Zero flash votes → the oldest tied film wins.
28. A tied flash vote → the oldest tied film wins.
29. Closing the runoff finishes the week and opens the next one.
30. `/f/:code` is reachable without a `fn_person` cookie; an expired code 410s.

**Identity**
31. `/u/:token` sets the cookie and redirects; an unknown token 404s.
32. Rotating a token invalidates the old link.
33. Every mutating route rejects an anonymous caller except the runoff routes.

---

## 12. Deployment

```
adapter: @sveltejs/adapter-node
db:      /var/lib/filmnight/filmnight.db   (WAL; the .db-wal and .db-shm live beside it)
proxy:   Caddy, automatic HTTPS
service: systemd, Restart=always
backup:  nightly `sqlite3 filmnight.db ".backup /var/backups/filmnight-$(date +%F).db"`,
         keep 30. Optionally Litestream to any S3-compatible bucket.
```

Environment:

```
ORIGIN=https://filmnight.example
RULES=banked
TMDB_API_KEY=…
TZ=Europe/Warsaw
DATABASE_PATH=/var/lib/filmnight/filmnight.db
```

`ORIGIN` must be set or SvelteKit form actions will fail CSRF checks behind a proxy.

**Seed script** (`pnpm seed`): creates the six people with random tokens, opens week 1,
and prints each person's full link to stdout once. Send them out over Signal, then never
print them again.

---

## 13. Build order

1. Schema, migrations, seed script, `/u/:token`, `hooks.server.ts`. Confirm you can open
   your own link and see your name.
2. Rules module + scoring + budget, with tests 1–14 passing before any UI exists.
3. The list page: standings, `setPoints`, nomination without TMDB.
4. Week close, attrition, banks, the scheduler. Tests 15–23.
5. Runoff, room QR, `/f/:code`, `/host`. Tests 24–30.
6. TMDB search, posters, `/me`, `/history`, polish.

Steps 1–4 are a working system for six people. Everything after is comfort.

---

## 14. Deliberately not included

- Any notion of "attendance" beyond the runoff. Whether you came doesn't affect your
  points; that would punish the person who's away and undermine the whole design.
- Comments, ratings, or a chat. There's a group chat already.
- Admin roles. All six are equal; anyone can close a week early.
- Undo of a watched film. If you watched the wrong thing, edit the database.

---

## 15. Open questions for the group

1. **Which rule set goes live.** `RULES=banked` is the default here because it tested best
   on fairness while keeping the list short, but `ledger` and `rolling` are one env var
   away. Agree to revisit after ~8 weeks with the `/history` table in front of you.
2. **Whether the room code should rotate.** A static code can be forwarded to someone at
   home. Rotating it every 20 seconds fixes that and costs a websocket. Probably not worth
   it for six friends.
3. **Guests.** Right now a guest can flash-vote anonymously but has no weekly points.
   Fine, or should they be silent?
