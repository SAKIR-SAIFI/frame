const { spawn } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, 'atlas-credentials.env'), quiet: true });

const uri = process.env.MONGODB_URI;
if (!uri) {
  process.stderr.write('MongoDB MCP requires MONGODB_URI in atlas-credentials.env or the process environment.\n');
  process.exit(1);
}

let connectionString;
try {
  const parsed = new URL(uri);
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) throw new Error('Unsupported MongoDB URI scheme.');
  parsed.pathname = `/${process.env.MONGODB_DB_NAME || 'perfectlens'}`;
  if (!parsed.searchParams.has('authSource')) parsed.searchParams.set('authSource', 'admin');
  connectionString = parsed.toString();
} catch (error) {
  process.stderr.write(`MongoDB MCP could not read MONGODB_URI: ${error.message}\n`);
  process.exit(1);
}

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(executable, ['-y', 'mongodb-mcp-server'], {
  cwd: projectRoot,
  env: { ...process.env, MDB_MCP_CONNECTION_STRING: connectionString },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  process.stderr.write(`MongoDB MCP could not start: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
