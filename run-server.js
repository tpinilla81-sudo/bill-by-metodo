const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = '/home/z/my-project/server-debug.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
}

log('Starting server wrapper...');

const child = spawn('node', ['.next/standalone/server.js'], {
  cwd: '/home/z/my-project',
  env: { ...process.env, PORT: '3000', HOSTNAME: '0.0.0.0', NODE_OPTIONS: '--max-old-space-size=4096' },
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (data) => {
  log(`STDOUT: ${data.toString().trim()}`);
});

child.stderr.on('data', (data) => {
  log(`STDERR: ${data.toString().trim()}`);
});

child.on('exit', (code, signal) => {
  log(`EXIT: code=${code} signal=${signal}`);
});

child.on('error', (err) => {
  log(`ERROR: ${err.message}`);
});

process.on('SIGTERM', () => log('Received SIGTERM'));
process.on('SIGINT', () => log('Received SIGINT'));

log(`Child PID: ${child.pid}`);

// Keep process alive
setInterval(() => {
  log(`HEARTBEAT: child alive=${child.killed === false}, pid=${child.pid}`);
}, 10000);
