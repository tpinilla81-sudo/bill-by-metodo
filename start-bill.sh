#!/bin/bash
# BILL Server Startup Script
# Usage: bash start-bill.sh

PORT=3000
DIR=/home/z/my-project

cd $DIR

# Kill existing
fuser -k $PORT/tcp 2>/dev/null
sleep 1

# Build if needed
if [ ! -d ".next" ]; then
  echo "Building..."
  npx next build
fi

# Generate Prisma client
npx prisma generate 2>/dev/null
npx prisma db push 2>/dev/null

echo "Starting BILL server on port $PORT..."

# Start with custom server (handles crashes better than standalone)
NODE_OPTIONS="--max-old-space-size=4096" node -e "
const { createServer } = require('http');
const next = require('next');
const app = next({ dev: false, hostname: '0.0.0.0', port: $PORT, dir: '$DIR' });
const handle = app.getRequestHandler();
process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err.message); });
process.on('unhandledRejection', (r) => { console.error('UNHANDLED:', String(r)); });

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
  server.listen($PORT, '0.0.0.0', () => console.log('> BILL Ready on port $PORT'));
});
"
