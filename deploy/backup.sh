#!/usr/bin/env bash
# nightly hot backup; keeps 30 days. sqlite3 .backup is safe against a live WAL writer.
set -euo pipefail

DB=${DATABASE_PATH:-/var/lib/filmnight/filmnight.db}
DEST=${BACKUP_DIR:-/var/backups/filmnight}
KEEP=${KEEP_DAYS:-30}

mkdir -p "$DEST"
sqlite3 "$DB" ".backup '$DEST/filmnight-$(date +%F).db'"
find "$DEST" -name 'filmnight-*.db' -mtime +"$KEEP" -delete
