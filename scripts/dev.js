const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const electronBinary = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const watchTargets = ['main.js', 'preload.js', 'lib', 'renderer'];

let childProcess = null;
let restartTimer = null;
const watchers = [];

function startElectron() {
  childProcess = spawn(electronBinary, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  });

  childProcess.on('exit', () => {
    childProcess = null;
  });
}

function stopElectron() {
  if (childProcess) {
    childProcess.kill();
  }
}

function restartElectron() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    stopElectron();
    startElectron();
  }, 200);
}

function watchTarget(target) {
  const fullPath = path.join(rootDir, target);
  const recursive = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  const watcher = fs.watch(fullPath, { recursive }, () => {
    restartElectron();
  });
  watchers.push(watcher);
}

function shutdown() {
  watchers.forEach((watcher) => watcher.close());
  stopElectron();
  process.exit(0);
}

watchTargets.forEach(watchTarget);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startElectron();
