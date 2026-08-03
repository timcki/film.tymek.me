export const SCHEMA = `
CREATE TABLE IF NOT EXISTS person (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
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
  tmdb_id      INTEGER,
  poster_url   TEXT,
  overview     TEXT,
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

CREATE TABLE IF NOT EXISTS tmdb_cache (
  query      TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- records a rule-set change so the list page can announce it for one week
CREATE TABLE IF NOT EXISTS rules_change (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rules_id    TEXT NOT NULL,
  week_number INTEGER NOT NULL REFERENCES week(number),
  created_at  TEXT NOT NULL
);
`;
