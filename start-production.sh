#!/bin/bash
cd /home/z/my-project/.next/standalone
export PORT=3000
export HOSTNAME=0.0.0.0
export NODE_OPTIONS="--max-old-space-size=4096"
exec node server.js 2>>/tmp/bill-stderr.log
