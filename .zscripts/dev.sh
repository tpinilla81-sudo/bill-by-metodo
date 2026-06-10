#!/bin/bash
cd /home/z/my-project
npx prisma generate 2>/dev/null
npx prisma db push --accept-data-loss 2>/dev/null

while true; do
  echo "[$(date)] Starting BILL server..."
  node custom-server.js 2>&1
  echo "[$(date)] Server exited, restarting in 3s..."
  sleep 3
done
