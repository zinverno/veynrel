// Retained Stage 11 probes for this repository; no sibling checkout required.
// All mutations and their evidence stay in a disposable directory outside the repository.
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import process from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(join(tmpdir(), "vault-proposal-mutations-"));
const application = "proposals/application.test.ts";
const hashCheck = 'if (stableHash(current) !== proposal.baseContentHash || current !== proposal.baseContent) throw new ProposalConflict();';
const cases = [
  { id: "B", name: "approval skips base hash precondition", file: "proposals/application.ts", from: hashCheck,
    to: '// mutation: base precondition skipped', test: application, pattern: "stale expected hash conflicts" },
  { id: "D", name: "Vault write precedes successful claim", file: "proposals/application.ts",
    from: 'const claim = await this.api.claimProposal(this.vaultId, reviewed.proposalId);',
    to: 'await this.vault.update(reviewed.path, () => reviewed.proposedContent!); const claim = await this.api.claimProposal(this.vaultId, reviewed.proposalId);', test: application, pattern: "claim failure or Companion outage" },
  { id: "E", name: "approval performs two Vault mutations", file: "proposals/application.ts",
    from: 'await this.vault.update(proposal.path, (current) => { check(current); return proposal.proposedContent!; });',
    to: 'await this.vault.update(proposal.path, (current) => { check(current); return proposal.proposedContent!; }); await this.vault.update(proposal.path, () => proposal.proposedContent!);', test: application, pattern: "double click Approve" },
  { id: "F", name: "changed Vault content is applied after claim", file: "proposals/application.ts",
    from: '(current) => { check(current); return proposal.proposedContent!; }', to: '(_current) => proposal.proposedContent!', test: application, pattern: "content changed after claim" },
  { id: "H", name: "Reject modifies Vault", file: "proposals/application.ts",
    from: 'reject(id: string): Promise<ProposalSummary> { return this.api.rejectProposal(this.vaultId, id); }',
    to: 'async reject(id: string): Promise<ProposalSummary> { await this.vault.update("A.md", () => "incorrect reject write"); return this.api.rejectProposal(this.vaultId, id); }', test: application, pattern: "Reject modifies only proposal state" },
];
function run(item) {
  const cwd = scratch;
  return spawnSync(process.execPath, [join(cwd, "node_modules/vitest/vitest.mjs"), "run", item.test, "-t", item.pattern],
    { cwd, encoding: "utf8", timeout: 30000 });
}
function passes(result) { assert.equal(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout, /[1-9][0-9]* passed/); }
try {
  for (const path of ["package.json", "tsconfig.json", "proposals", "chunking", "companionSync", "utils"]) {
    await cp(join(root, path), join(scratch, path), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
  for (const item of cases) {
    const path = join(scratch, item.file); const original = await readFile(path, "utf8");
    assert.equal(original.split(item.from).length, 2, `Ambiguous mutation ${item.id}`);
    passes(run(item));
    try {
      await writeFile(path, original.replace(item.from, item.to)); const result = run(item);
      assert.notEqual(result.status, 0, `SURVIVED ${item.id}`);
      assert.match(result.stdout + result.stderr, /AssertionError/, `Non-assertion failure ${item.id}: ${result.stdout}${result.stderr}`);
      process.stdout.write(`${item.id}: KILLED — ${item.name}\n`);
    } finally { await writeFile(path, original); }
    passes(run(item));
  }
  process.stdout.write(`${cases.length}/${cases.length} Stage 11 mutations killed; every restored test passed.\n`);
} finally { await rm(scratch, { recursive: true, force: true }); }
