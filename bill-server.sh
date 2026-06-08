#!/bin/bash
# BILL Server - Auto-restart wrapper
# This script keeps the server running even if it crashes

PORT=3000
DIR=/home/z/my-project
LOG=$DIR/server.log

cd $DIR

# Kill any existing server
fuser -k $PORT/tcp 2>/dev/null
sleep 1

echo "[$(date)] Starting BILL server..." > $LOG

while true; do
  echo "[$(date)] Starting server..." >> $LOG

  node -e "
const { createServer } = require('http');
const next = require('next');
const app = next({ dev: false, hostname: '0.0.0.0', port: $PORT, dir: '$DIR' });
const handle = app.getRequestHandler();
process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err.message); });
process.on('unhandledRejection', (r) => { console.error('UNHANDLED:', String(r)); });
process.on('exit', (code) => { console.error('EXIT CODE:', code); });

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const { parse } = require('url');
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      if (!res.headersSent) { res.statusCode = 500; res.end('error'); }
    }
  });
  server.listen($PORT, '0.0.0.0', () => console.log('> Ready on port $PORT'));
});
" >> $LOG 2>&1

  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE" >> $LOG

  # Wait before restarting
  sleep 3
done
