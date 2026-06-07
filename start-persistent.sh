#!/bin/bash
# Persistent server starter with auto-restart using double-fork
cd /home/z/my-project
export PORT=3000
export HOSTNAME=0.0.0.0
export NODE_OPTIONS="--max-old-space-size=4096"

while true; do
  # Double-fork to detach from shell
  (
    nohup node .next/standalone/server.js > /home/z/my-project/server.log 2>&1 &
    echo $! > /home/z/my-project/server.pid
  )
  
  # Wait for server to start
  sleep 5
  
  # Monitor the server - if PID dies, restart
  while true; do
    PID=$(cat /home/z/my-project/server.pid 2>/dev/null)
    if [ -z "$PID" ] || ! kill -0 $PID 2>/dev/null; then
      echo "[$(date)] Server process died, restarting..." >> /home/z/my-project/restart.log
      break
    fi
    sleep 5
  done
  
  sleep 2
done
