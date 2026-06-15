const { spawn } = require('child_process');

function startServer() {
  console.log('[keep-alive] Starting server at', new Date().toISOString());
  const child = spawn('node', ['server.js'], {
    cwd: '/home/z/my-project/.next/standalone',
    env: { ...process.env, PORT: '3000', HOSTNAME: '0.0.0.0', NODE_OPTIONS: '--max-old-space-size=4096' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => { process.stdout.write(data); });
  child.stderr.on('data', (data) => { process.stderr.write(data); });

  child.on('exit', (code, signal) => {
    console.log(`[keep-alive] Server exited code=${code} signal=${signal}. Restarting in 2s...`);
    setTimeout(startServer, 2000);
  });

  child.on('error', (err) => {
    console.error('[keep-alive] Error:', err.message);
    setTimeout(startServer, 2000);
  });
}

startServer();
