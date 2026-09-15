import { describe, expect, it } from "vitest";
import { validProposalDetail, validProposalPath } from "./proposalTypes";
import type { ProposalDetail } from "./proposalTypes";
import { stableHash } from "../chunking/hash";

describe("proposal paths use the actual Vault configuration directory", () => {
  it.each([".obsidian", ".config", "Private/Settings", "settings.md"])("rejects the root and descendants of %s", (configDir) => {
    for (const path of [configDir, `${configDir}/test.md`, `${configDir}/plugins/test.md`, `${configDir.toUpperCase()}/Test.MD`]) {
      expect(validProposalPath(path, configDir)).toBe(false);
    }
    expect(validProposalPath(`${configDir}/test.md`, `${configDir}/`)).toBe(false);
    expect(validProposalPath(`${configDir}-notes/test.md`, configDir)).toBe(true);
    expect(validProposalPath(`notes/${configDir}/test.md`, configDir)).toBe(true);
    expect(validProposalPath("Notes/Тест 😀.md", configDir)).toBe(true);
  });

  it("does not confuse an unrelated folder or prefix with the configuration directory", () => {
    expect(validProposalPath(".configuration/test.md", ".config")).toBe(true);
    expect(validProposalPath(".obsidian/test.md", ".config")).toBe(true);
    expect(validProposalPath("notes/.config/test.md", ".config")).toBe(true);
    expect(validProposalPath("Notes/Test.md", "")).toBe(false);
  });

  it.each(["../Escape.md", "Notes/../../Escape.md", "Notes/../Escape.md", "/Escape.md", "C:/Escape.md",
    "Notes\\Escape.md", "Notes//Escape.md", "./Escape.md", "Notes/./Escape.md", "Notes./Escape.md",
    "Notes /Escape.md", " Notes/Escape.md", "Notes/Escape.md ", "Notes/\0Escape.md", "Notes/\u007fEscape.md",
    "javascript:evil.md", "Notes/Test.txt", ""])("retains hostile-path rejection: %j", (path) => {
    expect(validProposalPath(path, ".obsidian")).toBe(false);
    expect(validProposalPath(path, ".config")).toBe(false);
  });

  it.each([".obsidian", ".config"])("rejects a structurally valid malicious detail for %s", (configDir) => {
    const proposal: ProposalDetail = {
      proposalId: "11111111-1111-4111-8111-111111111111", operation: "CREATE_NOTE", path: `${configDir}/payload.md`,
      summary: "Write config", status: "PENDING", createdAt: 1, updatedAt: 1, claimedAt: null,
      claimExpiresAt: null, appliedAt: null, statusCode: null, baseContent: null, baseContentHash: null,
      proposedContent: "payload", proposedContentHash: stableHash("payload"),
    };
    expect(validProposalDetail(proposal, configDir)).toBe(false);
    expect(validProposalDetail({ ...proposal, path: "Notes/Test.md" }, configDir)).toBe(true);
  });
});
