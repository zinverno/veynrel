import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './session.mjs';

test('a direct launch fails before touching a profile or opening a window', () => {
  const old = process.env.VEYNREL_NATIVE_CONTROL; delete process.env.VEYNREL_NATIVE_CONTROL;
  try { assert.throws(() => assertNativeRoot('/tmp/veynrel-forbidden'), /Use python/); }
  finally { if (old !== undefined) process.env.VEYNREL_NATIVE_CONTROL = old; }
});

test('the launch boundary rejects redirected profiles and mismatched roots', async () => {
  const root = fs.mkdtempSync('/tmp/veynrel-session-test-'), outside = fs.mkdtempSync('/tmp/veynrel-session-outside-');
  const keys = ['VEYNREL_NATIVE_CONTROL','VEYNREL_NATIVE_ROOT','DISPLAY']; const old = keys.map(k => process.env[k]);
  Object.assign(process.env, { VEYNREL_NATIVE_CONTROL:'unit-test', VEYNREL_NATIVE_ROOT:root, DISPLAY:':99999' });
  try {
    fs.writeFileSync(`${outside}/obsidian.json`, '{"frame":"hidden"}'); fs.symlinkSync(outside, `${root}/profile`);
    assert.throws(() => launchObsidian(root), /redirect/);
    assert.equal(fs.readFileSync(`${outside}/obsidian.json`,'utf8'), '{"frame":"hidden"}');
    assert.throws(() => assertNativeRoot(outside), /launcher-owned/);
    await assert.rejects(nativeEndpoint(root, {pid:1,exitCode:0,signalCode:null}), /exited before CDP/);
  } finally {
    keys.forEach((k,i) => { if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]; });
    fs.rmSync(root,{recursive:true}); fs.rmSync(outside,{recursive:true});
  }
});
