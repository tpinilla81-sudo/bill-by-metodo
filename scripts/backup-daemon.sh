#!/bin/bash
# Auto-backup daemon for BILL app
# Runs backup every 4 hours in a loop
# Usage: nohup bash scripts/backup-daemon.sh &

BACKUP_INTERVAL=$((4 * 60 * 60)) # 4 hours in seconds
SCRIPT_DIR="/home/z/my-project"
LOG_FILE="$SCRIPT_DIR/backups/backup.log"

echo "[$(date)] Backup daemon started. Interval: 4 hours" >> "$LOG_FILE"

while true; do
  # Run backup
  echo "[$(date)] Running scheduled backup..." >> "$LOG_FILE"
  cd "$SCRIPT_DIR" && /usr/bin/node scripts/auto-backup.mjs >> "$LOG_FILE" 2>&1
  
  # Sleep for interval
  sleep "$BACKUP_INTERVAL"
done
