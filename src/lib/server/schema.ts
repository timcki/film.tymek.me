export const SCHEMA = `
CREATE TABLE IF NOT EXISTS person (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  -- profile picture, stored inline: 22 people times a few tens of kB is nothing,
  -- and it keeps the whole app one file to back up
  avatar            BLOB,
  avatar_mime       TEXT,
  avatar_updated_at TEXT,
  -- may reach /admin; seeded from the ADMINS environment variable at boot
  is_admin          INTEGER NOT NULL DEFAULT 0,
  -- cache of the person's XP; rebuilt wholesale by rexpAll() inside every
  -- mutating transaction that touches its inputs, so it can never drift
  xp                INTEGER NOT NULL DEFAULT 0,
  -- the newest changelog entry this person has dismissed
  changelog_seen    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS week (
  number         INTEGER PRIMARY KEY,
  opens_at       TEXT NOT NULL,
  closes_at      TEXT NOT NULL,
  status         TEXT NOT NULL,
  winner_film_id INTEGER REFERENCES film(id),
  resolved_at    TEXT
);

CREATE TABLE IF NOT EXISTS film (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  title_key    TEXT NOT NULL,
  year         INTEGER,
  director     TEXT,
  genre        TEXT,
  runtime      INTEGER,
  tmdb_id      INTEGER,
  poster_url   TEXT,
  overview     TEXT,
  -- the nominator's pitch, editable by them alone
  note         TEXT,
  added_by     TEXT NOT NULL REFERENCES person(id),
  added_week   INTEGER NOT NULL REFERENCES week(number),
  status       TEXT NOT NULL DEFAULT 'active',
  watched_week INTEGER REFERENCES week(number),
  final_score  REAL,
  -- cache of the current score; rebuilt wholesale by rescoreAll() inside every
  -- mutating transaction, so it can never drift from the ballot table
  score        REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  -- a record of a night that happened rather than a nomination in play: kept off
  -- the list, out of attrition, and out of the one-per-round index. What lets a
  -- film proposed in week 12 and never watched be written down without landing
  -- on today's ballot
  archival     INTEGER NOT NULL DEFAULT 0
);

-- the one-per-person-per-round index lives in LATE_INDEXES, not here: it names
-- archival, which a database created before that column does not have until
-- ADDED_COLUMNS has run
CREATE INDEX IF NOT EXISTS film_title_key ON film(title_key);
CREATE INDEX IF NOT EXISTS film_status ON film(status);

CREATE TABLE IF NOT EXISTS ballot (
  week_number INTEGER NOT NULL REFERENCES week(number),
  person_id   TEXT    NOT NULL REFERENCES person(id),
  film_id     INTEGER NOT NULL REFERENCES film(id),
  points      INTEGER NOT NULL CHECK (points > 0),
  -- §8.3: the value before the last raise. While the grace window is open the
  -- vote can fall back to this; once it shuts, points can only go up
  prev_points INTEGER NOT NULL DEFAULT 0,
  -- when the last raise happened; the grace window is measured from here
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (week_number, person_id, film_id)
);
CREATE INDEX IF NOT EXISTS ballot_film ON ballot(film_id);
CREATE INDEX IF NOT EXISTS ballot_week ON ballot(week_number);

CREATE TABLE IF NOT EXISTS bank (
  person_id  TEXT PRIMARY KEY REFERENCES person(id),
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runoff (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number    INTEGER NOT NULL REFERENCES week(number),
  code           TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  closed_at      TEXT,
  winner_film_id INTEGER REFERENCES film(id)
);

CREATE TABLE IF NOT EXISTS runoff_film (
  runoff_id INTEGER NOT NULL REFERENCES runoff(id),
  film_id   INTEGER NOT NULL REFERENCES film(id),
  PRIMARY KEY (runoff_id, film_id)
);

CREATE TABLE IF NOT EXISTS runoff_ballot (
  runoff_id  INTEGER NOT NULL REFERENCES runoff(id),
  voter_key  TEXT    NOT NULL,
  person_id  TEXT    REFERENCES person(id),
  film_id    INTEGER NOT NULL REFERENCES film(id),
  -- §7.2: ordered film ids; NULL preserves a legacy first-choice-only ballot
  ranking    TEXT,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (runoff_id, voter_key)
);

-- §7.4: who was in the room on a given night. Scanning the room code and
-- identifying yourself is the whole ceremony; a flash vote implies it
CREATE TABLE IF NOT EXISTS attendance (
  week_number   INTEGER NOT NULL REFERENCES week(number),
  person_id     TEXT    NOT NULL REFERENCES person(id),
  checked_in_at TEXT    NOT NULL,
  PRIMARY KEY (week_number, person_id)
);

CREATE TABLE IF NOT EXISTS tmdb_cache (
  query      TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- the film nights themselves. A week's closes_at is taken from the next planned
-- night, so moving or deleting one moves the whole round; with no rows at all the
-- app falls back to next Thursday 20:00 and behaves exactly as it did before
CREATE TABLE IF NOT EXISTS night (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'planned',
  week_number INTEGER REFERENCES week(number),
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS night_at ON night(at);
CREATE INDEX IF NOT EXISTS night_status ON night(status);

-- every admin action, so a surprising change can be traced to whoever made it
CREATE TABLE IF NOT EXISTS audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  TEXT NOT NULL REFERENCES person(id),
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at);

-- records a rule-set change, so the stats know which rules each round was played by
CREATE TABLE IF NOT EXISTS rules_change (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rules_id    TEXT NOT NULL,
  week_number INTEGER NOT NULL REFERENCES week(number),
  created_at  TEXT NOT NULL
);

-- anyone's two cents on a suggestion; permanent, unlike the nominator's note
CREATE TABLE IF NOT EXISTS film_comment (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  film_id    INTEGER NOT NULL REFERENCES film(id),
  person_id  TEXT    NOT NULL REFERENCES person(id),
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS film_comment_film ON film_comment(film_id);

-- who has already seen a film, so a pick's rewatch factor is out in the open
CREATE TABLE IF NOT EXISTS film_seen (
  film_id    INTEGER NOT NULL REFERENCES film(id),
  person_id  TEXT    NOT NULL REFERENCES person(id),
  created_at TEXT    NOT NULL,
  PRIMARY KEY (film_id, person_id)
);

-- §3.5: a film its nominator has asked the room to skip for one round. It keeps
-- its score and fades like everything else; it simply is not a candidate on the
-- night, and the film below it takes the slot. One per person per round, so
-- stepping aside is a choice between your own films rather than a free veto
CREATE TABLE IF NOT EXISTS film_hold (
  week_number INTEGER NOT NULL REFERENCES week(number),
  film_id     INTEGER NOT NULL REFERENCES film(id),
  -- always the nominator, even when an admin placed it on their behalf: it is
  -- their one hold for the round that is being spent
  person_id   TEXT    NOT NULL REFERENCES person(id),
  -- optional one-liner, the message that would otherwise go to the group chat
  reason      TEXT,
  -- 0 once a round has ignored it, because every candidate had stepped aside
  applied     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (week_number, film_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS film_hold_one_per_person
  ON film_hold(week_number, person_id);

-- who felt what about a comment; one of each feeling per person, retractable
CREATE TABLE IF NOT EXISTS comment_react (
  comment_id INTEGER NOT NULL REFERENCES film_comment(id),
  person_id  TEXT    NOT NULL REFERENCES person(id),
  emoji      TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (comment_id, person_id, emoji)
);

-- §3.6: a special round's ballot. Not points: a tick on every pick you would
-- happily sit through, as many as you like, freely taken back until the round
-- closes. Kept apart from ballot so a special round can never touch the list's
-- scores, budgets or attrition
CREATE TABLE IF NOT EXISTS approval (
  film_id    INTEGER NOT NULL REFERENCES film(id),
  person_id  TEXT    NOT NULL REFERENCES person(id),
  created_at TEXT    NOT NULL,
  PRIMARY KEY (film_id, person_id)
);
`;

/**
 * Columns added after the first deployment. CREATE TABLE IF NOT EXISTS leaves an
 * existing table alone, so a database created before these columns existed needs
 * them added by hand. Applied on every open; adding a column is idempotent here
 * because it is guarded on PRAGMA table_info.
 */
export const ADDED_COLUMNS: [table: string, column: string, decl: string][] = [
	['person', 'avatar', 'BLOB'],
	['person', 'avatar_mime', 'TEXT'],
	['person', 'avatar_updated_at', 'TEXT'],
	['person', 'is_admin', 'INTEGER NOT NULL DEFAULT 0'],
	['film', 'genre', 'TEXT'],
	['film', 'runtime', 'INTEGER'],
	// where a film was made, as TMDB's production countries in ISO alpha-2, comma
	// separated: what the statistics map is coloured by. NULL until TMDB said
	['film', 'countries', 'TEXT'],
	['film', 'note', 'TEXT'],
	['film', 'archival', 'INTEGER NOT NULL DEFAULT 0'],
	['ballot', 'prev_points', 'INTEGER NOT NULL DEFAULT 0'],
	['person', 'xp', 'INTEGER NOT NULL DEFAULT 0'],
	['person', 'changelog_seen', 'INTEGER NOT NULL DEFAULT 0'],
	['runoff_ballot', 'ranking', 'TEXT'],
	// §7.2: when the host started the count on the projector; phones keep the
	// result to themselves until it has run
	['runoff', 'revealed_at', 'TEXT'],
	// §3.6: a round given over to a special night. The list sleeps through it:
	// no points, no nominations, and the round does not count towards fade or
	// attrition, so the list wakes up exactly where it was left
	['week', 'special', 'TEXT'],
	// §3.6: the look an admin put on the site during this round, 'default' for
	// taking one off, NULL when nobody touched it. The site wears the latest
	// round's choice, so a look stays on until somebody takes it off, and every
	// round still says what it looked like
	['week', 'look', 'TEXT'],
	// a line an admin pins above every page, kept the way look is: the latest
	// round's word stands until somebody changes it, '' for taking it down
	['week', 'notice', 'TEXT'],
	// §3.7: a special round an admin named and gave rules to, as JSON. Written once
	// when the round goes special, so every round keeps the rules it was played by
	['week', 'custom', 'TEXT'],
	// §3.6: a pick for a special round rather than a nomination to the list. It
	// never appears on the list, never takes points, and once its round is over
	// it is either the night's film or dropped with the rest
	['film', 'special', 'TEXT'],
	// §3.6: the nominator's own list film this pick was put up from. The list
	// film is left alone while the night is on; if the pick wins it is watched
	// and the list film goes, and if it loses nothing on the list has changed
	['film', 'from_list', 'INTEGER'],
	// §3.6: a date put into the calendar for an extra night, not one of the
	// round's own. Calling the night off takes it out again, so the list's round
	// runs on to the night it had; a night anybody planned stays where it is
	['night', 'extra', 'INTEGER NOT NULL DEFAULT 0'],
	// a film watched together somewhere other than a film night: 'cinema' or
	// 'trip'. An evening like any other in what we have watched, and nowhere in
	// what measures the game: no XP, no fairness table, no round's winner
	['film', 'outing', 'TEXT'],
	// when an evening written down afterwards was, an outing or a film night, which
	// is what puts it among the evenings. NULL for a film a round decided, whose
	// evening is its round's night
	['film', 'watched_at', 'TEXT']
];

/**
 * Index work that has to happen after ADDED_COLUMNS, because it names columns a
 * database created before them does not have yet. Applied on every open; each
 * statement is a no-op once it has run.
 *
 * The old index covered every film ever, so it enforced a rule about the open
 * round against a year of history: re-crediting two of week 12's films to one
 * person was impossible, and writing down a second film for a week somebody had
 * already nominated in collided with their nomination. Scoping it to the rows
 * the rule is actually about leaves history free to be rearranged.
 */
export const LATE_INDEXES: string[] = [
	'DROP INDEX IF EXISTS film_one_per_person_per_week',
	// §3.6: a special round's picks are not nominations, and a person has more
	// than one of them, so the one-per-round rule is scoped to the list's films
	'DROP INDEX IF EXISTS film_one_per_person_per_round',
	`CREATE UNIQUE INDEX IF NOT EXISTS film_one_nomination_per_round
	   ON film(added_by, added_week)
	   WHERE archival = 0 AND status != 'watched' AND special IS NULL`,
	'CREATE INDEX IF NOT EXISTS approval_person ON approval(person_id)'
];
