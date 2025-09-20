#!/usr/bin/env node

// Set environment variables to disable all Next.js development overlays
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.DISABLE_ESLINT_PLUGIN = 'true';
process.env.FAST_REFRESH = 'false';
process.env.__NEXT_DISABLE_OVERLAY = 'true';
process.env.__NEXT_DISABLE_OVERLAY_WARNING = 'true';
process.env.TURBOPACK_DEV_OVERLAY = 'false';
process.env.NEXT_DISABLE_DEV_OVERLAY = 'true';
process.env.__NEXT_DISABLE_FAST_REFRESH = 'true';

// Start Next.js
const { spawn } = require('child_process');
const path = require('path');

const nextBin = path.join(__dirname, 'node_modules', '.bin', 'next');
const child = spawn('node', [nextBin, 'dev', '-p', '3000'], {
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('exit', (code) => {
  process.exit(code);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

