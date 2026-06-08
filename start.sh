#!/bin/bash
cd /home/z/my-project
export NODE_ENV=production
exec node .next/standalone/server.js
