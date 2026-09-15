import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import { stableHash } from "../chunking/hash";
import { CLAIM_LEASE_MS, validProposalDetail, validProposalPath } from "./proposalTypes";
import type { ProposalDetail } from "./proposalTypes";
import { COMPANION_PROTOCOL_HEADER, COMPANION_PROTOCOL_VERSION } from "./types";
import type { CompanionServerStatus, CompanionSyncBatch, CompanionSyncBatchResult } from "./types";

interface ProtocolFixture {
  protocolVersion: number; header: string; claimLeaseMs: number; vaultId: string;
  hashes: { text: string; hash: string }[]; allowedPaths: string[]; deniedPaths: string[];
  proposal: ProposalDetail; batch: CompanionSyncBatch; status: CompanionServerStatus; batchResult: CompanionSyncBatchResult;
}
// Read raw JSON so the intentional lone UTF-16 surrogate bypasses Vite's JSON transform.
const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/companion-protocol-v1.json", import.meta.url), "utf8")) as ProtocolFixture;

vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));
import { CompanionClient } from "./client";

describe("frozen Companion protocol v1", () => {
  it("retains versions, Unicode hashes, paths and immutable proposal validation", () => {
    expect(COMPANION_PROTOCOL_VERSION).toBe(fixture.protocolVersion);
    expect(COMPANION_PROTOCOL_HEADER).toBe(fixture.header);
    expect(CLAIM_LEASE_MS).toBe(fixture.claimLeaseMs);
    for (const { text, hash } of fixture.hashes) expect(stableHash(text)).toBe(hash);
    for (const path of fixture.allowedPaths) expect(validProposalPath(path, ".obsidian")).toBe(true);
    for (const path of fixture.deniedPaths) expect(validProposalPath(path, ".obsidian")).toBe(false);
    expect(validProposalDetail(fixture.proposal, ".obsidian")).toBe(true);
    expect(validProposalDetail({ ...fixture.proposal, proposedContent: "tampered" }, ".obsidian")).toBe(false);
  });

  it("emits v1 auth/header/batch and accepts the frozen server response", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const requests: RequestUrlParam[] = [];
    const transport = (input: RequestUrlParam | string): Promise<RequestUrlResponse> => {
      if (typeof input === "string") throw new Error("Expected a structured request");
      requests.push(input);
      const body = input.url.endsWith("/status") ? fixture.status : fixture.batchResult;
      return Promise.resolve({ status: 200, headers: {}, json: body, text: JSON.stringify(body), arrayBuffer: new ArrayBuffer(0) });
    };
    try {
      const client = new CompanionClient({ enabled: true, endpoint: "http://127.0.0.1:27124", token: "contract-test-only", timeoutMs: 500, vaultId: fixture.vaultId }, transport);
      expect(await client.status()).toEqual(fixture.status);
      expect(await client.applyBatch(fixture.vaultId, fixture.batch)).toEqual(fixture.batchResult);
      expect(requests[1]?.headers).toEqual({ Authorization: "Bearer contract-test-only", [fixture.header]: "1" });
      const body = requests[1]?.body;
      if (typeof body !== "string") throw new Error("Expected JSON request body");
      expect(JSON.parse(body) as unknown).toEqual(fixture.batch);
    } finally { vi.unstubAllGlobals(); }
  });
});
