#!/usr/bin/env node
'use strict';

// npm's own bin shim always runs this under plain Node, never under Electron,
// so `electron` resolves to the path of its packaged binary rather than the
// Electron API. Spawning it against the package root (one level up from this
// file) works from any install location, since main.js and everything it
// loads resolve their own paths from __dirname rather than the caller's cwd.

const { spawn } = require('node:child_process');
const path = require('node:path');

const electronPath = require('electron');
const appRoot = path.join(__dirname, '..');

const child = spawn(electronPath, [appRoot], { stdio: 'inherit' });

child.on('close', (code) => {
  process.exitCode = code === null ? 1 : code;
});
