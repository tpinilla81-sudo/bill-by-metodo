const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const app = next({ dev: false, hostname: '0.0.0.0', port: 3000 });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('> Ready on http://0.0.0.0:3000');
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled:', err);
  });
});
