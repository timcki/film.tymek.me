#!/usr/bin/env bash
# Builds the public demo the way the box builds it, and runs it here: snapshot
# production, anonymise the snapshot, serve the anonymised copy with DEMO=1.
# Production is never written to, and neither is the snapshot; the anonymiser
# only ever writes to the copy it made.
#
#   ./deploy/test-demo.sh              # fresh snapshot, anonymise, then vite dev
#   SNAPSHOT=0 ./deploy/test-demo.sh   # re-anonymise the snapshot already here
#   LOCAL_ORIGIN=http://localhost:5174 ./deploy/test-demo.sh   # stay on this machine
set -euo pipefail

HOST=${HOST:-bigchungus}
REMOTE_DB=${REMOTE_DB:-/var/lib/filmnight/filmnight.db}
HERE=$(cd "$(dirname "$0")/.." && pwd)
# the snapshot and the demo built from it are two files on purpose: the snapshot
# is the real thing and never gets served, the demo is what the browser sees
SNAP_DB=${SNAP_DB:-$HERE/data/prod-snapshot.db}
DEMO_DB=${DEMO_DB:-$HERE/data/demo-copy.db}
SNAPSHOT=${SNAPSHOT:-1}
DEV_PORT=${DEV_PORT:-5174}
DEMO_HOME=${DEMO_HOME:-https://tymek.me}

# This machine's tailnet address, or nothing when tailscale is not up. The demo
# renders QR codes on /me and /host exactly as the real app does, and a QR saying
# localhost is one no phone can follow.
tailnet_ip() {
	command -v tailscale >/dev/null 2>&1 || return 1
	local ip
	ip=$(tailscale ip -4 2>/dev/null | head -1)
	[[ -n "$ip" ]] || return 1
	echo "$ip"
}

if [[ -z "${LOCAL_ORIGIN:-}" ]]; then
	if ip=$(tailnet_ip); then
		LOCAL_ORIGIN="http://$ip:$DEV_PORT"
	else
		LOCAL_ORIGIN="http://localhost:$DEV_PORT"
		echo "==> tailscale is not up; QR codes will point at localhost" >&2
	fi
fi

if [[ "$SNAPSHOT" == 1 ]]; then
	echo "==> snapshotting $HOST:$REMOTE_DB"
	# .backup is safe against a live WAL writer, and it is what the hourly refresh
	# on the box does too; the anonymiser refuses a source with a -wal beside it
	ssh "$HOST" "sudo sqlite3 $REMOTE_DB \".backup '/tmp/filmnight-demo.db'\" && sudo chmod 644 /tmp/filmnight-demo.db"
	mkdir -p "$HERE/data"
	# the -wal and -shm of the previous snapshot belong to a database that is about
	# to be replaced, and SQLite would replay a stranger's pages over the fresh copy
	rm -f "$SNAP_DB" "$SNAP_DB-wal" "$SNAP_DB-shm"
	rsync -z "$HOST:/tmp/filmnight-demo.db" "$SNAP_DB"
	ssh "$HOST" "sudo rm -f /tmp/filmnight-demo.db"
	echo "==> snapshot at $SNAP_DB"
elif [[ ! -f "$SNAP_DB" ]]; then
	echo "no snapshot at $SNAP_DB; run once without SNAPSHOT=0 first" >&2
	exit 1
else
	echo "==> reusing the snapshot at $SNAP_DB"
fi

cd "$HERE"
echo "==> anonymising into $DEMO_DB"
# a failed verification leaves no output at all, and set -e stops here, which is
# the same contract the timer on the box runs on: no demo beats a leaking one
rm -f "$DEMO_DB" "$DEMO_DB-wal" "$DEMO_DB-shm"
npm run anonymise -- "$SNAP_DB" "$DEMO_DB"

echo "==> the demo's cast (none of these people exist):"
sqlite3 "$DEMO_DB" "SELECT '    ' || name FROM person WHERE active = 1 ORDER BY name LIMIT 5"
echo "    ..."

echo "==> starting the demo at $LOCAL_ORIGIN (ctrl-c to stop)"
echo "    open it with no cookie to land as a regular member; the bar switches persona"
# --port explicitly, so the port the QR codes advertise is the port it binds
DEMO=1 DEMO_HOME="$DEMO_HOME" ORIGIN="$LOCAL_ORIGIN" DATABASE_PATH="$DEMO_DB" \
	npm run dev -- --host --port "$DEV_PORT"
