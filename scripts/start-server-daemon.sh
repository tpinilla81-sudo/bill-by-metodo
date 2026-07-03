#!/bin/bash
# Properly daemonize the BILL server watchdog using double-fork
# This ensures the process survives shell exits

cd /home/z/my-project
LOGFILE=/tmp/bill-server.log
PIDFILE=/tmp/bill-server.pid

# Kill any existing instances
pkill -f "node custom-server" 2>/dev/null
pkill -f "keep-alive-simple" 2>/dev/null
pkill -f "bill-watchdog-daemon" 2>/dev/null
sleep 1

# Double-fork daemonization
(
  # First fork - become sub-reaper
  setsid bash -c '
    # Second fork - fully detach
    (exec -a bill-watchdog-daemon bash /home/z/my-project/.zscripts/keep-alive-simple.sh) < /dev/null > '"$LOGFILE"' 2>&1 &
    echo $! > '"$PIDFILE"'
    exit 0
  ' < /dev/null > /dev/null 2>&1 &
  disown
) 

sleep 5
echo "Watchdog PID: $(cat $PIDFILE 2>/dev/null)"
ps -ef | grep -E "bill-watchdog|node custom" | grep -v grep
