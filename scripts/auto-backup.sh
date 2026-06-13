#!/bin/bash
# Auto-backup cron job for BILL
# Runs every 4 hours via crontab
# Crontab entry: 0 */4 * * * /home/z/my-project/scripts/auto-backup.sh

curl -s -X POST http://localhost:3000/api/auto-backup > /dev/null 2>&1
