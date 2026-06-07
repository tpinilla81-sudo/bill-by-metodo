const { createServer } = require('http');
const next = require('next');

const app = next({ 
  dev: false, 
  dir: '/home/z/my-project',
  conf: require('/home/z/my-project/.next/required-server-files.json').config
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });
  
  server.listen(3000, '0.0.0.0', () => {
    console.log('> Ready on http://0.0.0.0:3000');
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
  
  // Keep process alive
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
  });
  
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
  });
});
