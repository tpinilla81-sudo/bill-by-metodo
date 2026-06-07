#!/bin/bash
cd /home/z/my-project
export PORT=3000
export HOSTNAME=0.0.0.0
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  node .next/standalone/server.js 2>&1
  echo "[$(date)] Restarting in 2s..."
  sleep 2
done
