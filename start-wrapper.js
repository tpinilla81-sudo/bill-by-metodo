const { spawn } = require('child_process');
const path = require('path');

const child = spawn('/bin/bash', ['/home/z/my-project/start-production.sh'], {
  env: { ...process.env, PORT: '3000', HOSTNAME: '0.0.0.0', NODE_OPTIONS: '--max-old-space-size=4096' },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  console.log('Server exited with code:', code);
});
