#!/bin/bash
cd /home/z/my-project/.next/standalone
while true; do
  node server.js
  echo "Server crashed, restarting in 2s..."
  sleep 2
done
