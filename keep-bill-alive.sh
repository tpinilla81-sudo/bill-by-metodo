#!/bin/bash
# BILL - Keep alive wrapper
# Restarts the server if it crashes

PORT=3000
DIR=/home/z/my-project
LOG=$DIR/server.log

cd $DIR

while true; do
  fuser -k $PORT/tcp 2>/dev/null
  sleep 1
  echo "[$(date)] Starting BILL..." > $LOG
  npx next start -p $PORT >> $LOG 2>&1
  echo "[$(date)] Server died, restarting in 3s..." >> $LOG
  sleep 3
done
