const { createServer } = require('http');

const hostname = '0.0.0.0';
const port = 3000;

// Set env
process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
process.env.SESSION_SECRET = 'bill-secret-key-change-in-production-2024';

const next = require('next');
const app = next({ dev: false, hostname, port, dir: '/home/z/my-project' });
const handle = app.getRequestHandler();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const { parse } = require('url');
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, hostname, () => {
    console.log('> Ready on http://' + hostname + ':' + port);
  });
}).catch((err) => {
  console.error('Failed to prepare:', err);
  process.exit(1);
});
