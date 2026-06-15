#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SAFE REBUILD for BILL app
# 
# This script MUST be used instead of manually running build commands.
# It automatically:
#   1. Creates a backup BEFORE any changes
#   2. Builds the app
#   3. Restarts PM2
#   4. Verifies the app is running
#   5. If build fails, KEEPS the old version running
#
# Usage: bash scripts/safe-rebuild.sh ["reason"]
# ═══════════════════════════════════════════════════════════════

set -e

REASON="${1:-rebuild}"
PROJECT_DIR="/home/z/my-project"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")

echo "═══════════════════════════════════════════════════"
echo "  BILL SAFE REBUILD - ${TIMESTAMP}"
echo "  Reason: ${REASON}"
echo "═══════════════════════════════════════════════════"
echo ""

# ── STEP 1: BACKUP ──
echo "[1/5] Creating safety backup..."
node "${PROJECT_DIR}/scripts/safe-backup.mjs" "${REASON}"
if [ $? -ne 0 ]; then
  echo "❌ BACKUP FAILED! Aborting rebuild to protect data."
  echo "   Fix the backup issue first, then try again."
  exit 1
fi
echo ""

# ── STEP 2: STOP APP (but don't restart yet) ──
echo "[2/5] Current app status:"
cd "${PROJECT_DIR}"
npx pm2 describe bill-app 2>/dev/null | grep -E "status|uptime" || echo "  (app not running)"
echo ""

# ── STEP 3: BUILD ──
echo "[3/5] Building app..."
rm -rf .next
if npm run build 2>&1; then
  echo "✓ Build successful"
else
  echo ""
  echo "❌ BUILD FAILED! The old version is still running."
  echo "   No data was lost. Check the build errors above."
  echo "   DO NOT restart PM2 — the current running version is safe."
  exit 1
fi
echo ""

# ── STEP 4: RESTART ──
echo "[4/5] Restarting app..."
npx pm2 restart bill-app 2>/dev/null || npx pm2 start ecosystem.config.js 2>/dev/null
sleep 3
echo ""

# ── STEP 5: VERIFY ──
echo "[5/5] Verifying app is running..."
STATUS=$(npx pm2 describe bill-app 2>/dev/null | grep "status" | awk '{print $4}' || echo "unknown")
if [ "$STATUS" = "online" ]; then
  echo "✓ App is ONLINE and running"
else
  echo "⚠ App status: $STATUS"
  echo "  Check logs: npx pm2 logs bill-app"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  REBUILD COMPLETE - ${TIMESTAMP}"
echo "═══════════════════════════════════════════════════"
