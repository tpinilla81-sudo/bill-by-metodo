#!/bin/bash
# Simple watchdog - just restarts the server if it dies
# Does NOT run prisma generate (which can cause Prisma client state issues)

cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  echo "[$(date)] Starting BILL server..."
  node custom-server.js 2>&1
  echo "[$(date)] Server exited with code $?, restarting in 3s..."
  sleep 3
done
