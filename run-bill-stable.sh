#!/bin/bash
cd /home/z/my-project
export PORT=3000
export HOSTNAME=0.0.0.0
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  echo "[$(date)] Starting BILL server..."
  node custom-server.js 2>&1
  echo "[$(date)] Server crashed, restarting in 3s..."
  sleep 3
done
