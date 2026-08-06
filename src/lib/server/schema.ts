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
  is_admin          INTEGER NOT NULL DEFAULT 0
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
  created_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS film_one_per_person_per_week ON film(added_by, added_week);
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
-- night, so moving or skipping one moves the whole round; with no rows at all the
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

-- records a rule-set change so the list page can announce it for one week
CREATE TABLE IF NOT EXISTS rules_change (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rules_id    TEXT NOT NULL,
  week_number INTEGER NOT NULL REFERENCES week(number),
  created_at  TEXT NOT NULL
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
	['film', 'note', 'TEXT'],
	['ballot', 'prev_points', 'INTEGER NOT NULL DEFAULT 0']
];
