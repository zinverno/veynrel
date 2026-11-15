// Shared launch boundary only; existing native scenarios and assertions stay in their harnesses.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export function assertNativeRoot(root) {
  assert(process.env.VEYNREL_NATIVE_CONTROL && process.env.DISPLAY,
    'Use python scripts/native/run.py; direct launch could open windows on the working desktop.');
  assert(root && path.resolve(root) === process.env.VEYNREL_NATIVE_ROOT,
    'The harness must use the launcher-owned disposable root.');
  assert(path.dirname(root) === '/tmp' && path.basename(root).startsWith('veynrel-'));
}

export function launchObsidian(root) {
  assertNativeRoot(root);
  const profile = path.join(root, 'profile');
  assert.equal(fs.realpathSync(profile), profile, 'Profile must not redirect to another vault/profile');
  const configPath = path.join(profile, 'obsidian.json');
  assert(!fs.lstatSync(configPath).isSymbolicLink());
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.frame = 'native';
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
  const log = fs.openSync(path.join(root, 'electron.log'), 'a');
  try {
    return spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', `--user-data-dir=${profile}`,
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--disable-gpu', '--ozone-platform=x11'],
    { stdio: ['ignore', 'ignore', log] });
  } finally { fs.closeSync(log); }
}

export async function nativeEndpoint(root, child) {
  assertNativeRoot(root);
  for (let attempt = 0; attempt < 200; attempt++) {
    assert(child.pid && child.exitCode === null && child.signalCode === null, 'Disposable Obsidian exited before CDP readiness');
    const file = path.join(root, 'profile', 'DevToolsActivePort');
    if (fs.existsSync(file)) {
      const [rawPort, browser] = fs.readFileSync(file, 'utf8').trim().split('\n');
      const port = Number(rawPort);
      if (Number.isInteger(port) && port > 0 && port < 65536 && /^\/devtools\/browser\/[\w-]+$/.test(browser ?? '')) {
        fs.appendFileSync(path.join(root, 'native-sessions.jsonl'), JSON.stringify({ pid: child.pid, port, browser, display: process.env.DISPLAY, frame: 'native' }) + '\n');
        return `http://127.0.0.1:${port}`;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Timed out waiting for the disposable profile DevToolsActivePort');
}
