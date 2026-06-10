#!/bin/bash
while true; do
  sleep 5
  if ! curl -s -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    echo "[$(date)] Server down, restarting..." >> /tmp/bill-watchdog.log
    cd /home/z/my-project
    node custom-server.js >> /tmp/bill-prod.log 2>&1 &
    echo $! > /home/z/my-project/server.pid
    sleep 3
  fi
done
