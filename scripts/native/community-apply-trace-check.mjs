// Validate the bounded real-native evidence; these assertions are not DOM mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../docs/r06/evidence/community-apply-attribution/', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const labels = ['A1','B1','A2','B2','A3','B3'];
const reports = labels.map(label => read(`native/${label}/report.json`));
const chain = ['actual-button-handler','StudioView.run','runner.reviewWrite','StudioView.writeDialog','StudioView.dialog','Modal.open call site','StudioDialog.onOpen'];

test('six fixed A/B attempts preserve the fixture and exercise the actual handler/plan/modal path', () => {
  const protocol = read('protocol.json');
  for (const [i, report] of reports.entries()) {
    assert.equal(report.status, 'DIAGNOSTIC');
    assert.deepEqual(report.artifacts, protocol.configurations[labels[i][0]].assets);
    assert.deepEqual(report.before, reports[0].before);
    assert.deepEqual(report.after, report.before);
    assert.equal(report.version.obsidian, '1.13.7');
    assert.equal(report.version.electron, '43.6.0');
    assert.deepEqual(report.exceptions, []);
    assert.equal(report.providerRequests, 1, 'Only the explicitly consented synthetic generation');
    assert.equal(report.keyboardControl, undefined, 'Handler was reached; no Enter fallback was eligible');
    const pointer = report.pointer, events = pointer.events;
    assert.deepEqual(events.filter(e => chain.includes(e.kind)).map(e => e.kind), chain);
    assert.deepEqual(events.filter(e => e.kind === 'button-event').map(e => e.name),
      ['pointerdown','mousedown','pointerup','mouseup','click']);
    assert(pointer.after.writePlan);
    assert.equal(pointer.after.busy, false);
    assert.equal(pointer.after.state, 'review');
    assert.equal(pointer.after.canApply, true);
    assert.deepEqual(pointer.after.io.writes, []);
    assert.equal(pointer.after.io.browserRequests, 0);
    assert.equal(pointer.after.io.reads.length - pointer.before.io.reads.length, 1);
    assert(!events.some(e => ['StudioView.onClose','leaf-change'].includes(e.kind)));
  }
});

test('baseline A2 remains FAIL despite successful handler and connected modal in another document', () => {
  const failed = reports[2];
  assert.equal(failed.pointer.outcome, 'FAIL');
  assert.match(failed.pointerWaitError, /Timeout/);
  assert.equal(failed.pointer.after.modalCount, 0);
  const [modal] = failed.pointer.after.views[0].dialogs;
  assert.equal(modal.active, true);
  assert.equal(modal.modalConnected, true);
  assert.equal(modal.contentConnected, true);
  assert.equal(modal.sameDocument, false);
  assert.equal(modal.owner, undefined, 'Owner identity was not captured in A2; do not infer it from A3');
  assert.deepEqual(reports.map(r=>r.pointer.outcome), ['PASS','PASS','FAIL','PASS','PASS','PASS']);
});

test('all disposable process groups and twelve distinct CDP endpoints were closed', () => {
  const ports = [];
  for (const label of labels) {
    const result = read(`native/${label}/isolation/result.json`);
    const environment = read(`native/${label}/isolation/environment.json`);
    assert.equal(result.exitCode, 0, 'Diagnostic completion is separate from pointer outcome');
    assert.equal(result.processGroupClean, true);
    assert.equal(result.cdpClosed, true);
    assert.equal(environment.backend, 'xvfb-openbox');
    assert.equal(environment.privateDisplay, true);
    assert.equal(environment.frame, 'native');
    ports.push(...result.cdpPorts);
  }
  assert.equal(ports.length, 12); assert.equal(new Set(ports).size, 12);
});
