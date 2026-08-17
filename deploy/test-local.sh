#!/usr/bin/env bash
# Snapshots the production database and runs the app on it locally, so a change
# can be poked at with real data before deploying. Edits stay in the local copy;
# production is never written to.
#
#   ./deploy/test-local.sh              # fresh snapshot, then vite dev on it
#   SNAPSHOT=0 ./deploy/test-local.sh   # reuse the last snapshot
#   LOCAL_ORIGIN=http://mymac.tailnet:5173 ./deploy/test-local.sh   # phone testing
set -euo pipefail

HOST=${HOST:-bigchungus}
REMOTE_DB=${REMOTE_DB:-/var/lib/filmnight/filmnight.db}
HERE=$(cd "$(dirname "$0")/.." && pwd)
LOCAL_DB=${LOCAL_DB:-$HERE/data/prod-copy.db}
SNAPSHOT=${SNAPSHOT:-1}
# what the printed links and the in-app QR codes point at; override with your
# tailscale name to test from a phone
LOCAL_ORIGIN=${LOCAL_ORIGIN:-http://localhost:5173}

if [[ "$SNAPSHOT" == 1 ]]; then
	echo "==> snapshotting $HOST:$REMOTE_DB"
	# .backup is safe against a live WAL writer; the copy in /tmp is world-readable
	# for a moment so the ssh user can pull it, then removed
	ssh "$HOST" "sudo sqlite3 $REMOTE_DB \".backup '/tmp/filmnight-test.db'\" && sudo chmod 644 /tmp/filmnight-test.db"
	mkdir -p "$HERE/data"
	# the -wal and -shm of the previous snapshot belong to a database that is about
	# to be replaced. Left in place, SQLite treats them as this file's journal and
	# replays a stranger's pages over the fresh copy: the table says 'watched' while
	# the index on it still says 'active', the list shows films that are gone, and
	# voting on one is refused by a server reading the row the list never saw
	rm -f "$LOCAL_DB" "$LOCAL_DB-wal" "$LOCAL_DB-shm"
	rsync -z "$HOST:/tmp/filmnight-test.db" "$LOCAL_DB"
	ssh "$HOST" "sudo rm -f /tmp/filmnight-test.db"
	echo "==> snapshot at $LOCAL_DB"
	sqlite3 "$LOCAL_DB" 'PRAGMA integrity_check;' | head -5
elif [[ ! -f "$LOCAL_DB" ]]; then
	echo "no snapshot at $LOCAL_DB; run once without SNAPSHOT=0 first" >&2
	exit 1
else
	echo "==> reusing the snapshot at $LOCAL_DB"
fi

echo "==> personal links on the local copy:"
sqlite3 "$LOCAL_DB" "SELECT '    ' || name || '  $LOCAL_ORIGIN/u/' || token FROM person WHERE active = 1 ORDER BY name"

echo "==> starting vite dev on the prod copy, bound to 0.0.0.0 (ctrl-c to stop)"
cd "$HERE"
ORIGIN="$LOCAL_ORIGIN" DATABASE_PATH="$LOCAL_DB" npm run dev -- --host
