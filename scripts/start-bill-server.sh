#!/bin/bash
# Double-fork daemon launcher for the BILL Next.js server.
# Survives shell/terminal exit (PPID becomes 1).

cd /home/z/my-project

LOG=/tmp/bill-server.log
PIDFILE=/tmp/bill-server.pid

# Kill any existing instance
if [ -f "$PIDFILE" ]; then
  OLDPID=$(cat "$PIDFILE")
  if kill -0 "$OLDPID" 2>/dev/null; then
    echo "Killing previous server (PID $OLDPID)"
    kill -9 "$OLDPID" 2>/dev/null
    sleep 1
  fi
fi

# Also kill any leftover node custom-server.js
pkill -f "node custom-server.js" 2>/dev/null
sleep 1

# Double-fork: child → setsid → grandchild (PPID=1)
(
  setsid bash -c '
    cd /home/z/my-project
    export NODE_ENV=production
    export DATABASE_URL="file:/home/z/my-project/db/custom.db"
    while true; do
      echo "[$(date)] Starting BILL server..." >> '"$LOG"'
      node custom-server.js >> '"$LOG"' 2>&1
      echo "[$(date)] Server exited (rc=$?), restarting in 3s..." >> '"$LOG"'
      sleep 3
    done
  ' </dev/null >/dev/null 2>&1 &
  echo $! > "$PIDFILE"
)

sleep 3

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  echo "Server daemon started (watchdog PID $PID)"
  # Wait for actual node process to spawn
  sleep 2
  NODE_PID=$(pgrep -f "node custom-server.js" | head -1)
  if [ -n "$NODE_PID" ]; then
    echo "Node server running (PID $NODE_PID)"
  fi
else
  echo "Failed to start server"
  exit 1
fi
