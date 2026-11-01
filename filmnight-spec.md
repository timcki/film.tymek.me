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
| **Evening** | A night we watched something, numbered from the first. What a round is called on screen: the week number counts Thursdays, met or not, so it never appears there. A round that ends without a film shares its number with the next. |
| **Outing** | A film watched together outside the vote (the cinema, a trip), written down afterwards with its date. It is an evening of its own and counts in history and the film statistics, but never as a round's winner or a nominator's win. |
| **Nomination** | Adding a film to the list. One per person per week, free, doesn't bank. |
| **Ballot** | Points a person has put on a film in a given week. |
| **Score** | A film's current standing, computed from ballots per the active rule set. |
| **Runoff** | The room step every decided night: a QR code, one flash vote per person present. |
| **Flash vote** | A vote cast in a runoff. Decides the night only; never affects scores. |
| **Bank** | A person's stored unspent points. Only exists in the `banked` rule set. |
| **Attendance** | A row saying you were in the room that night. Earned by scanning the room code and identifying yourself; a flash vote implies it. |
| **XP** | Experience points, derived from attendance, ballots and films. Cosmetic: levels and titles, never voting power. |

---

## 3. Rule sets

Exactly one is active, chosen by `RULES` in the environment. Default `weekly`, the set
that went live in August 2026; `ledger`, `rolling` and `banked` remain one env var away.

```ts
// src/lib/server/rules.ts

export type RuleSetId = 'ledger' | 'rolling' | 'banked' | 'weekly';

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
  scoring: 'total' | 'decay' | 'fade';
  /**
   * 'decay': weight of last week's points in the two-week window.
   * 'fade': weekly multiplier applied to every past week's points, so a point
   * cast n weeks ago is worth decayFactor^n. Unused under 'total'.
   */
  decayFactor: number;
  /** what happens to films nobody is voting for */
  attrition:
    | { kind: 'archive'; afterWeeksAtZero: number }   // hidden but revivable by a vote
    | { kind: 'drop'; afterWeeksWithoutPoints: number }; // removed; revivable only by re-nomination
  nominationsPerWeek: number;
  /** how many films go to the room; the strict top N of the §3.2 ordering */
  shortlistSize: number;
  /** §8.3: how long a cast vote can still be unwound, in seconds */
  voteGraceSeconds: number;
};

export const RULE_SETS: Record<RuleSetId, RuleSet> = {
  // ledger, rolling and banked as before (see rules.ts), all with
  // shortlistSize 3 and voteGraceSeconds 30; the live set:
  weekly: {
    id: 'weekly',
    label: 'Weekly',
    pointsPerWeek: 3,
    banking: false,
    bankCap: 0,
    scoring: 'fade',
    // 0.75 until August 2026; halved to bite harder on old campaigns
    decayFactor: 0.5,
    attrition: { kind: 'drop', afterWeeksWithoutPoints: 2 },
    nominationsPerWeek: 1,
    // 5 for a fortnight in August 2026, then back: five candidates in a room of
    // six is not a shortlist, it is the list again
    shortlistSize: 3,
    voteGraceSeconds: 30
  }
};
```

`weekly` in one breath: three points a week, use them or lose them; points on a film lose
half their value each week; the top three go to the room; weekly votes are final after
thirty seconds, though a flash vote in the room (§7.2) moves freely until it closes. There is no pass-over penalty; time taxes every film equally, which is the whole
rotation mechanic.

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
  if (rules.scoring === 'fade') {
    // every past week contributes, geometrically discounted by age, so the
    // score stays recomputable from the ballot table alone
    let sum = 0;
    for (const [week, p] of points) {
      if (week > currentWeek) continue;
      sum += p * rules.decayFactor ** (currentWeek - week);
    }
    return sum;
  }
  // 'decay' — deliberately a two-week window, not a recursive EMA.
  // Simulation showed the two forms are indistinguishable in outcome, and this
  // one is stateless: it can always be recomputed from the ballot table alone.
  return (points.get(currentWeek) ?? 0) + rules.decayFactor * (points.get(currentWeek - 1) ?? 0);
}
```

Under `fade`, scores are fractional; the UI shows one decimal. A film with one devoted
backer feeding 3 points a week sustains at most 3 / (1 − 0.5) = 6, so scores live in a
narrow, legible band and a leader that is not fed this week visibly sags by half.

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

### 3.5 Holding a film back

**Added August 2026.** Somebody who cannot make the night, and would rather the room did
not watch their film without them, asks it to sit the round out. Until now that ask went
to the group chat; this is the same ask, said in the app, where it can actually be acted
on.

- The **nominator** places the hold, on a film of theirs with status `active`, at any
  point while the round is open. An admin may place or lift one on their behalf (§8.4),
  because the ask usually arrives from someone who will not open the site; the row still
  records the nominator, since it is their hold being spent.
- **One per person per round.** Enforced by a unique index on
  `film_hold(week_number, person_id)`, so it is a choice between your own films rather
  than a free veto over the list.
- **Revocable until the round closes.** Unlike a vote (§8.3) a hold can be lifted freely,
  because lifting one only ever *adds* a candidate; nothing anyone else did is undone.
- **The only effect is candidacy.** At close the held film is skipped when the shortlist
  forms and the film below it takes the slot (§6.1). Score, fade, attrition, XP, backers
  and history are untouched. A held leader comes back next round at half strength, and
  that fade is the whole cost of holding.
- **Where every candidate is held, none of them is.** The holds for that round are marked
  `applied = 0` and the shortlist forms as though none had been placed, so the room can
  never be handed an empty screen. The rows stay as a record of what was asked for.
- **No cutoff.** A hold placed at 19:55 is legal, because "something came up tonight" is
  the case the mechanic exists for. The cost is that points other people spent on the film
  this round are stranded: votes are final, so they fade rather than return. This is why a
  hold is public the instant it is placed — it is information the room can still act on.

An optional reason of up to 160 characters rides along and is shown to everyone. It is the
group-chat message; without somewhere to put it, people would still write it there.

### 3.6 Special rounds

**Added October 2026, for Halloween.** An admin can give the open round over to one night
with its own picks and its own way of voting (`/admin/calendar`). The round's numbers
live in `src/lib/specials.ts`, so the page says what the round is from the same values
the engine enforces, the way the rules screen reads the `RuleSet`. The first such round
was stored as `'halloween'`; it runs by the same rules as `'approval'`.

- **Its own picks.** Each person puts up `picksPerPerson` films (one for Halloween),
  marked `film.special`, outside the list's one-nomination-a-round slot. The usual
  duplicate rules (§4.1) apply against everything, the list included.
- **Hidden approval voting.** Each pick can be ticked ("I want to see it") by anyone, as
  many as they like, their own included, and unticked until the round closes. Ticks live
  in `approval`, never in `ballot`. Nobody sees the counts, only who has voted, so there is
  nothing to react to. A special film's `score` is its approval count, rebuilt by
  `rescoreAll()` like any other score.
- **The room, as usual.** At close the `shortlistSize` most approved picks go to the room
  (§7) and the night is decided there. Ties fall back to §3.2.
- **The list sleeps.** While the round is on, nobody spends points or nominates, and the
  round neither fades nor ages anything. The list keeps its own clock: a special round's
  week shares its ordinal with the week after it (`listClock`), so fade, attrition and the
  archive's ages all read as though the night had not happened. The same goes for what
  anyone had spent, nominated or held back that week before the round was given over:
  when the list wakes it is still theirs, against the same budget, slot and hold
  (`listRound`), and the bank settles once for the two. An extra night is set up this
  way and leaves the list exactly where it was, only paused while it runs. Picks nobody watched are dropped afterwards rather
  than joining the list.
An admin can call a special round off only while nobody has put a pick up.

**The look is a separate choice.** By default everyone picks their own palette (dark,
light, bananas). An admin can instead put a look on the whole site (Halloween and
Christmas so far, `LOOKS` in `src/lib/themes.ts`), whatever the round votes by. The choice is written on
the round it was made in (`week.look`, `'default'` for taking one off) and the site wears
the latest one, so it stays on until somebody takes it off and each round still says
what it looked like. It is decoration only, and asks for less motion are honoured
throughout.

### 3.7 Custom weeks

**Added after Halloween 2026.** A special round (§3.6) can be set up before it starts: a name,
a line about it, how many picks each person gets (up to three), and rules a pick has to
meet. It is set up fresh each time; there are no templates. The setup is stored on the
round as `week.custom` and goes when the round is called off. The menus and the rule
shapes live in `src/lib/custom-weeks.ts`, so the special page, the rules screen and the
admin's summary all say the rules from the values the server checks.

- **Every rule set has to hold, any value of each will do.** A rule is a list of
  production countries, original languages or genres, a range of release years or of
  runtimes, a list of directors (matched by whole names in any order, case and diacritics aside), or one of
  the rules written by hand (`CODED`, so far "directed by a woman", read off TMDB's
  gender field). A country that has since split counts as its successor, as in `/stats`.
  "Polish week" is the production-country rule or the original-language rule, whichever
  the admin means.
- **Checked at pick time, against TMDB.** The facts come from the same details fetch the
  pick already makes. A week with rules takes no typed-in titles, and a pick TMDB says
  nothing about is refused, because there is nothing to check it against.
- **A refusal names the rule it broke** (`off_theme`, with the rule folded into flat
  parameters), said in the reader's language at the edge (invariant 6).
- **A running week can be put right.** Its name, its line and its picks can change while it
  is open, the picks never below what somebody has already put up. Its rules are fixed
  from the first pick, because changing them would leave a pick standing under rules it
  was never checked against (`custom_rules_locked`, `custom_picks_used`).
- **Everything else is §3.6.** Approval voting, the room, the list asleep. The look stays
  a separate choice even when it is an obvious pair with the week.

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
  -- §8.3: the value before the last raise; what the vote can fall back to
  -- while the grace window is open
  prev_points INTEGER NOT NULL DEFAULT 0,
  -- when the last raise happened; the grace window is measured from here
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

-- §3.5: a film its nominator has asked the room to skip for one round
CREATE TABLE film_hold (
  week_number INTEGER NOT NULL REFERENCES week(number),
  film_id     INTEGER NOT NULL REFERENCES film(id),
  person_id   TEXT    NOT NULL REFERENCES person(id),  -- always the nominator
  reason      TEXT,                                    -- optional, shown to everyone
  applied     INTEGER NOT NULL DEFAULT 1,              -- 0 once a round has ignored it
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (week_number, film_id)
);
CREATE UNIQUE INDEX film_hold_one_per_person ON film_hold(week_number, person_id);

-- §7.4: who was in the room on a given night
CREATE TABLE attendance (
  week_number   INTEGER NOT NULL REFERENCES week(number),
  person_id     TEXT    NOT NULL REFERENCES person(id),
  checked_in_at TEXT    NOT NULL,
  PRIMARY KEY (week_number, person_id)
);

CREATE TABLE tmdb_cache (
  query      TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
```

The `person` table also carries two cache/bookkeeping columns: `xp` (rebuilt wholesale
by `rexpAll()`, §9.2) and `changelog_seen` (the newest changelog entry dismissed, §9.3).

A ballot row exists only when `points > 0`. Undoing a cast back to 0 within the grace
window (§8.3) deletes the row; outside the window points can only rise.

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
  candidates = standings.filter(f => f.score > 0)
  // §3.5: a film whose nominator asked it to wait is no candidate tonight, and the
  // film under it moves up. Where every candidate stepped aside, none of them does
  awake = candidates.filter(f => not held(w, f))
  if awake is empty: mark every hold of w applied = 0
  shortlist = (awake or candidates).slice(0, rules.shortlistSize)
  // every decided night goes to the room, even a lone candidate: the code on
  // the screen doubles as the attendance sheet, and letting the runoff expire
  // confirms the film
  create runoff(week=w, films=shortlist, code=newCode(), expires_at=now+3h)
  w.status = 'runoff'
  // the week stays unresolved until the runoff closes, or until it expires

finish(w, winner):                 // called by closeRunoff, §7.3
  winner.status = 'watched'; winner.watched_week = w.number; winner.final_score = score
  w.winner_film_id = winner.id; w.status = 'closed'; w.resolved_at = now
  applyAttrition(w)                // §3.4, after the winner is removed
  accrueBanks(w)                   // §3.3, only when rules.banking
  openWeek(w.number + 1)           // opens_at = now, closes_at = the next planned night
```

Points decide who the candidates are; the room decides which one gets watched. A
no-winner week creates no runoff and therefore no attendance sheet: nothing was
scheduled to happen, so nothing is recorded.

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

One row per `(runoff_id, voter_key)`. Each voter ranks every shortlisted film exactly
once, favourite first, then explicitly saves. Saving again **replaces** the entire ranking
until the runoff closes, including changes to lower preferences. A repeated identical
submission is an idempotent no-op. Incomplete or duplicate rankings are rejected without
changing an existing ballot.

Only the submitted ballot count is live. Neither voters nor the host receive first-choice
counts, ranked points or result-dependent film ordering before close. A voter can read their own saved ranking through their personal or guest-device
cookie; picking somebody's name or casting on their behalf does not expose their ballot.
After close, the host's results disclosure shows aggregate results and each person's
final submitted ranking by name. Guest ballots use numbered guest labels, never device
identifiers. Legacy ballots show only their recorded first choice.

Closing the room does not announce the result. The host screen holds it behind a
**count**: the host presses one button, `runoff.revealed_at` is stamped once, and the
screen lands the ballots one at a time, each handing out its points, while the films'
totals race in a fixed order that gives nothing away, and only then reorders them by
points with the winner on top. Phones in the room show *look at the screen* until the count has had time to
run (`src/lib/reveal.ts` holds the timings both sides share), so the room learns the
winner from the projector rather than from the phone in its hand. A room nobody counts,
because it closed on its own clock, tells its phones ten minutes after closing.
Replaying the count on the screen does not move the phones' clock.

`runoff_ballot.ranking` stores the ordered film ids as JSON; `film_id` retains the first
choice. A NULL ranking is a legacy ballot: that film is preferred to all others, with no
preference between the remaining films. It earns the top rank's points and gives the
others zero. A new submission replaces it with a complete ranking.

Flash votes are written to `runoff_ballot` and **never** to `ballot`. They do not touch
scores, banks, or attrition. This is the single most important invariant in the runoff:
being in the room breaks a tie, it does not buy influence.

### 7.3 Closing

`POST /host/close-runoff`, or automatically at `expires_at`.

```
winner = films ordered by (ranked points desc, then §3.2 ordering)
```

For N candidates, each ranking awards N-1 points to first place, N-2 to second, down to
zero for last: with three films, 2, 1 and 0. The most points wins. This used to crown a
film that beat every other head to head before looking at points; it was hard to explain
to a room and almost never disagreed with the points, so the points are now the whole
rule. Ties and zero turnout use §3.2: weekly score descending, then nomination week,
timestamp and id ascending. With one
candidate, the room simply confirms it. Then run `finish(week, winner)` from §6.1.

### 7.4 Attendance

Being in the room is worth remembering. One row per `(week_number, person_id)`,
recorded when:

- a person with their own cookie loads `/f/:code` while the runoff is not yet expired;
  scanning the code is the whole ceremony, and late arrivals after the film was picked
  still count;
- a name is picked on a shared phone (a dedicated `checkIn` action);
- an identified flash vote lands: `flashVote` itself checks the person in, so the
  invariant holds at the engine layer, not just in the route.

An idempotent seed runs at every boot: any historical `runoff_ballot` row with a known
`person_id` becomes an attendance row, so the record reaches back to week 1 and can
never rot. Anonymous guests leave no trace. Attendance affects XP (§9.2) and nothing
else; never scores, budgets, or attrition.

### 7.5 The host view

`/host` is a projector-friendly page: big room QR, the code in large monospace, the
shortlist, the submitted ballot count and a **Close** button. The collapsed proxy-voting
form accepts a complete ranking for someone whose phone is dead. Use it on an
unprojected screen to keep that ranking private. Closing reveals the winner through the
count: one bar of points per film, filling as the ballots land, with each person's full
ranking folded away under the result for anyone who wants it.

---

## 8. Routes

SvelteKit 2 file-based routing. Mutations are **form actions**, so the site works without
JavaScript; progressive enhancement (`use:enhance`) makes it feel instant.

```
src/routes/
  +layout.server.ts          -> locals.person, active week, rules label
  +page.svelte               -> the list
  +page.server.ts            -> load: standings, my ballots, my budget, my nomination
                                actions: setPoints, nominate, renominate, hold, release
  u/[token]/+server.ts       -> GET: set cookie, redirect
  me/+page.svelte            -> device QR, rotate token, your stats
  me/+page.server.ts         -> actions: rotate
  f/[code]/+page.svelte      -> flash vote
  f/[code]/+page.server.ts   -> load: runoff + tally; actions: flashVote, identify
  host/+page.svelte          -> projector view
  host/+page.server.ts       -> actions: close, closeRunoff, openRunoffManually
  admin/films/+page.server.ts-> actions: status, edit, watched, reassign, hold, remove
  history/+page.svelte       -> watched films, per-person stats
  api/search/+server.ts      -> GET ?q= -> TMDB proxy
```

### 8.1 `setPoints`

Takes `filmId` and an **absolute** point value, not a delta — deltas are not idempotent
and double-taps on a phone are common.

```
setPoints(person, filmId, points, now):
  BEGIN IMMEDIATE
  assert week is open and now < closes_at
  assert points >= 0
  floor = pointsFloor(row, now)                 // §8.3
  assert points >= floor                        // 409 'votes_final' otherwise
  spentElsewhere = sum(ballot.points where week, person, film != filmId)
  assert spentElsewhere + points <= budget(person)
  if points > current:  upsert row with prev_points = floor, updated_at = now
  if points < current and points == 0: delete row
  if points < current:  update points only      // the undo never stretches the window
  if film.status == 'archived' and points > 0: film.status = 'active'   // revival
  COMMIT
```

The `assert`s return 409 with a human-readable message; the UI shows it as a toast.

### 8.3 Votes are final

A cast vote is a commitment, not a position to shuffle all week. For
`voteGraceSeconds` (30) after a raise the vote can fall back to what it was before
the raise (misclick insurance for phones), and then it stands: points can only be
added. Concretely:

```
pointsFloor(row, now):
  if no row: return 0
  if now - row.updated_at < voteGraceSeconds: return row.prev_points
  return row.points
```

Raises inside one open window collapse (`prev_points` keeps the pre-window value), so
the undo unwinds them all; an undo never resets `updated_at`, so it cannot stretch the
window. The server's clock decides, as always. The UI mirrors the rule by hiding the
minus button once `myPoints <= myFloor`.

### 8.4 `hold` and `release`

```
hold(person, filmId, reason, now):
  BEGIN IMMEDIATE
  assert week is open and now < closes_at
  assert film exists, is not archival, and status == 'active'
  assert film.added_by == person                // 409 'not_your_film'
  spent = the person's hold for this round
  assert spent is absent or spent.film_id == filmId   // 409 'hold_taken'
  upsert film_hold, rewriting the reason        // a repeat tap is idempotent
  COMMIT
```

`release` is the same guards and a delete. Both take the *nominator's* id, which is what
lets the admin route (§3.5) place one on somebody's behalf by passing `film.added_by`
while the `audit` row records who actually pressed it.

Neither touches `ballot`, `film.score`, `bank` or `person.xp`. A hold decides candidacy on
one night and nothing else, which is the same invariant the runoff carries in §7.2.

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
your budget or bank, and whether your nomination is used. Then the ranked films: the
poster with the nominator's face resting on its top-left corner (wearing a slim, quiet
version of its rank ring; tapping it opens the same popup as a backer pill, with
"nominated in week N" as its caption), and a colour system with one meaning per hue:
accent blue is reserved for the viewer's own votes, the top-3 highlight is a neutral
silver elevation, the score sits hue-free in a circular "coin" (the vote dots' big
sibling; its ring brightens on a top-3 card), and tier colours mark rank. Tapping the
coin (or the sheet's score) opens a quick popup with the fade arithmetic: one row per
week with points — `week · points × multiplier ≈ contribution` — under a one-line
reminder that points lose 25% of their value each week. Then a
text-only title line — title, year, runtime — that wraps cleanly. Director, genre and
the week number live only in the detail sheet. Below the title line: the nominator's
note directly under the title, clamped to one line that ends before the coin (tapping
it opens the full pitch in a quick popup, quoted and signed); where nobody pitched, one
quiet line of the TMDB synopsis stands in (tappable the same way, unquoted), falling
back to director · genre. Then the footer — the top seven backer pills by points,
wrapping onto a second row when needed, a `+N` pill folding the rest (it opens a small
modal listing every backer pill; tapping a face there stacks the usual popup on top),
and the vote pill (or a Vote button when `pointsPerWeek === 1`). The pill is one tap target showing the whole weekly
budget as three small dots, film-relative: a check is a point of yours on this film, a
dim dot is a point busy on another film, a dashed dot is still free. Spent slots keep
the order the week's points were cast (approximated by each film's last raise, since
individual casts are not stored), so the same slot means the same point on every card
in the list. Casting takes two
taps: the first arms the next free dot (a pulsing accent circle; it relaxes after ~4s
or on a tap elsewhere, and an abandoned arm earns a one-line toast hint), the second
casts — final on the spot, and the list glides into its new order with a FLIP animation
(motion echoing explicit intent). The card shows no undo; the §8.3 grace window still
applies server-side and the detail sheet's three-pip dock keeps the ticking undo pip
as the quiet escape hatch. Spent out, the pill opens the sheet.
Below: the nomination box with TMDB autocomplete, the archived/dropped fold-out, watched
history, and a "how this works" fold showing the *active* rule set's rules.

Badges on a film row: an *N-week campaign* badge when one person has backed it for 3+
consecutive weeks, and a *fades/drops* warning when attrition is imminent.

A held film (§3.5) keeps its place in the ranking — its score is its score, and moving it
would be a lie about the standings — but renders dimmed, with a dashed border, and never
wears the lead elevation. The shortlist band is therefore no longer a prefix of the list:
the divider goes under the *last* candidate, so holding the third film makes the band span
ranks one to six with a greyed row inside it. The card's fine print carries a `💤` chip
saying whose film is waiting, tappable for the reason where there is one; on your own
candidate, before you have held anything, that chip is instead the one tap that holds it.
The whole control — reason, hold, release, and a line explaining the cost — lives in the
detail sheet, which is the one screen that belongs to a single film. `/host` lists what
stepped aside under the tally, before the close as a warning and after it as an
explanation.

**`/f/:code` — flash vote.** Enormous tap targets, the tied films as full-width cards,
live tally, nothing else. Assume a dim room and someone holding a beer.

**`/host` — projector.** Room QR at least 320px, code in 48px monospace.

**`/me`** — your Device QR with the red warning, rotate button, and your own numbers:
points spent all-time, films you nominated that got watched, longest campaign.

**`/history`** — watched films newest first, each under its evening (§2) with its final score, plus a small table of
who has had how many of their nominations watched. That table is the group's own check on
whether the active rule set is being fair.

### 9.2 XP and levels

Showing up should earn something visible, so it earns prestige, never voting power.
XP is **derived, like scores**: recomputable from the `attendance`, `ballot` and `film`
tables alone, which makes it retroactive to week 1 and impossible to corrupt.

| Source | XP |
|---|---|
| Attended a film night | 10 |
| Spent at least one point that week | 2 |
| Nominated a film | 1 |
| A film you nominated got watched | 15 |

Attendance dominates by design. The nomination reward is token-sized so the list cannot
be farmed; the watched-nomination jackpot rewards nominating things *other people* end
up wanting. Backing the winner earns nothing: it used to pay 3, until the group decided
that paying people for picking the favourite pushes everyone towards the safe,
mainstream film (removed October 2026).

Twelve named ranks, thresholds in `src/lib/levels.ts`, names in both dictionaries:
Widz 0, Bywalec 25, Zapaleniec 60, Kinofil 110, Kinoman 175, Maniak kina 255,
Znawca 350, Koneser 460, Krytyk 585, Kurator 720, Ikona 860, Legenda kina 1000.
The rungs are dense at the bottom on purpose: the first promotion lands after about
two attended nights, so the ladder hooks people immediately, while the top takes a
regular about a year and a half. A vote-only homebody climbs at roughly a quarter of
an attendee's pace; that gap *is* the attendance reward, expressed in prestige. Each
rank has a tier colour worn as a glowing ring on the face and on the rank title.

`person.xp` is a cache in the mould of `film.score`: rebuilt wholesale by `rexpAll()`,
the column's only writer, inside every mutating transaction that touches its inputs
(casting, checking in, nominating, closing a week, the admin film fixes) plus the
scheduler's once-a-minute honesty pass. XP moves only on events, never with the passage
of time, so there is no TTL anywhere. Reads are a plain SELECT; `/me` derives the
breakdown live for the one person looking.

Surfaces: rank title and progress bar on `/me` with the per-source breakdown, and the
rank title on the enlarged backer face. Badges, streaks and level perks are deliberately
out — see `FUTURE_IDEAS.md`.

### 9.3 The changelog

Rule changes deserve better than a banner somebody misses. Entries live in
`src/lib/changelog.ts` (monotonic id, date, title and body in both languages), and
`person.changelog_seen` remembers the newest id each person has dismissed. Any
authenticated page load with newer entries shows a modal, once; dismissing records the
id. A deploy with nothing worth saying adds no entry and shows nobody anything. Entry 1
announces the August 2026 rules change, which satisfies the announce-for-a-week duty in
§10 permanently.

---

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Nobody votes all week | No winner. Week closes, nothing watched, next week opens. Say so on the page. |
| Fewer than two films on the list | Fine. A lone candidate still goes to the room; the runoff closing or expiring confirms it. |
| Someone holds a film after others have backed it | Their points stay spent and fade; votes are final (§8.3). This is why a hold is public the instant it lands — there is still time to put the rest of the week's points elsewhere. |
| Every candidate is held in one round | No hold applies; the shortlist forms as normal and the rows are marked `applied = 0`. The room is never handed an empty screen. |
| A held film would have been the lone candidate | Same rule: the hold is ignored and the film goes to the room. |
| Holder turns up anyway | Nothing automatic — the shortlist formed hours earlier. The hold is on the card with their name on it all evening, which is the whole enforcement (principle 1). |
| A film sits in the top 3 unpicked for weeks | Its points fade like everyone else's; there is no extra penalty. If the room keeps declining a persistently fed film, see the pass-over strikes idea in `FUTURE_IDEAS.md`. |
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
1. A person cannot spend more than `pointsPerWeek` in a week (all non-banking rule sets).
2. In `banked`, a person cannot spend more than their bank balance.
3. In `banked`, unspent points carry over; the balance never exceeds `bankCap` and never
   goes negative.
4. Undoing a cast to 0 within the grace window frees the budget for another film in the
   same week; outside the window the points stay spent.

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

**Holds (§3.5)**
23a. A held film is skipped when the shortlist forms and the next film takes its slot.
23b. A held film keeps its status and score, and attrition still reaches it.
23c. Releasing it during the open round puts it back in the shortlist.
23d. Only the nominator may hold or release; one hold per person per round, swappable.
23e. Placing the same hold again rewrites only the reason.
23f. A hold is refused once the week is in `runoff` or `closed`.
23g. Where every candidate is held, none is: the shortlist is unchanged and every row for
     that round is marked `applied = 0`.
23h. Holds are keyed on the round, so the film is back in play the following week.

**Runoff**
24. A tie at the top creates a runoff and leaves the week `status='runoff'`.
25. Flash votes never appear in `ballot` and never change any film's score.
26. One flash vote per `voter_key`; the first is final, a same-film repeat is a no-op.
27. Zero flash votes → the oldest tied film wins.
28. A tied flash vote → the oldest tied film wins.
29. Closing the runoff finishes the week and opens the next one.
30. `/f/:code` is reachable without a `fn_person` cookie; an expired code 410s.

**Identity**
31. `/u/:token` sets the cookie and redirects; an unknown token 404s.
32. Rotating a token invalidates the old link.
33. Every mutating route rejects an anonymous caller except the runoff routes.

**Fade scoring**
34. A point cast n weeks ago is worth `decayFactor^n`; the same ballots viewed a week
    later are worth `decayFactor` times as much.
35. A passed-over shortlist film keeps its full faded score and every ballot row.
36. `final_score` freezes at the moment of watching and does not fade afterwards.

**Vote finality**
37. A full undo inside the grace window succeeds; the same undo one second after it
    shuts is rejected with `votes_final`.
38. Raises inside one window collapse; a raise after the window commits the earlier
    points as the new floor.
39. An undo does not stretch the window.

**Attendance**
40. Checking in is idempotent per night; a lone candidate's night still has a code.
41. An identified flash vote implies attendance; the boot seed converts historical
    flash votes and is itself idempotent.

**XP**
42. Each source pays at the published rate; a week of voting counts once however many
    films got points; points on the winner are worth no more than points anywhere else.
43. `person.xp` equals a from-scratch derivation after every event kind that touches
    its inputs, and catches up retroactively when history is seeded.

**Changelog**
44. Every entry has both languages and a unique id; a fresh person sees everything,
    a person who dismissed the newest id sees nothing.

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
RULES=weekly
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

- ~~Any notion of "attendance" beyond the runoff.~~ **Revised, August 2026.** The group
  grew to ~22 people with 6 to 8 regulars, and the consensus shifted: showing up should
  be rewarded. The original worry (punishing whoever is away) still shapes the design:
  attendance earns XP and titles (§9.2), never points, so absence costs prestige pace,
  not influence. Ideas that would convert presence into voting power (the underdog
  point, level perks) wait in `FUTURE_IDEAS.md` behind that same caution.
- Attendance rewards that touch the economy. See above.
- ~~Comments, ratings, or a chat. There's a group chat already.~~ **Revised, August
  2026.** Comments on a suggestion landed after all (`film_comment`): members only,
  permanent to their author (an admin can take one down), shown in the film's detail sheet and on the host's winner screen. Ratings
  and a chat remain out; there's a group chat already.
- Undo of a watched film. If you watched the wrong thing, edit the database.

---

## 15. Open questions for the group

1. **Which rule set goes live.** ~~`RULES=banked`~~ Settled, August 2026: `weekly` is
   live. The group ran `banked` for a season, found the pass-over halving unfair and the
   bank a reward for disengagement, and swapped both for fade scoring. The other three
   sets remain one env var away.
2. **Whether the room code should rotate.** A static code can be forwarded to someone at
   home. Rotating it every 20 seconds fixes that and costs a websocket. Probably not worth
   it for six friends.
3. **Guests.** Right now a guest can flash-vote anonymously but has no weekly points.
   Fine, or should they be silent?
