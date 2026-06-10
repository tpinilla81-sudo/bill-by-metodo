#!/bin/bash
# BILL auto-restart service
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=512"

while true; do
  node minimal-server.js 2>&1
  echo "[$(date)] Restarting in 2s..."
  sleep 2
done
