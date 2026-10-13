const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  process.exitCode = code;
}

for (const script of [path.join(__dirname, 'index.js'), path.join(root, 'node_modules/react-scripts/scripts/start.js')]) {
  const child = spawn(process.execPath, [script], { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
