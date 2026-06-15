module.exports = {
  apps: [
    {
      name: 'bill-app',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/home/z/my-project',
    },
    {
      name: 'bill-backup',
      script: '/home/z/my-project/scripts/safe-backup.mjs',
      interpreter: '/usr/bin/node',
      cron_restart: '0 */1 * * *',  // Run every 1 hour
      autorestart: false,            // Don't auto-restart after completion
      max_restarts: 0,               // Only run once per cron trigger
      restart_delay: 100,
    },
  ],
}
