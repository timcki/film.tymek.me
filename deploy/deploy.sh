#!/usr/bin/env bash
# Pushes the working tree to the host, builds there, restarts the service.
# Native modules are compiled on the target, so never rsync node_modules.
#
#   ./deploy/deploy.sh              # deploy to the default host
#   HOST=bigchungus ./deploy/deploy.sh
set -euo pipefail

HOST=${HOST:-chungus-1}
APP_DIR=${APP_DIR:-/opt/filmnight}
HERE=$(cd "$(dirname "$0")/.." && pwd)

echo "==> syncing to $HOST:$APP_DIR"
rsync -az --delete \
	--exclude node_modules \
	--exclude .svelte-kit \
	--exclude build \
	--exclude .seed \
	--exclude data \
	--exclude '.env' \
	--exclude '.git' \
	--exclude '.jj' \
	--exclude '.claude' \
	"$HERE/" "$HOST:/tmp/filmnight-sync/"

ssh "$HOST" "sudo rsync -a --delete --exclude data /tmp/filmnight-sync/ $APP_DIR/ && sudo chown -R filmnight:filmnight $APP_DIR && rm -rf /tmp/filmnight-sync"

echo "==> installing and building on $HOST"
ssh "$HOST" "cd $APP_DIR && sudo -u filmnight npm ci --no-audit --fund=false && sudo -u filmnight npm run build"

echo "==> restarting"
ssh "$HOST" "sudo systemctl restart filmnight && sleep 2 && systemctl is-active filmnight"

echo "==> done"
