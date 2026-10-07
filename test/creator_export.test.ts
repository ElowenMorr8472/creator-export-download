import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveredAssetCsv } from "../src/creator_export.ts";

test("exports only ready assets delivered to subscribers who accept updates", () => {
  const csv = buildDeliveredAssetCsv({
    creator_id: "creator-42",
    export_id: "weekly-7",
    subscribers: [
      { subscriber_id: "sub-1", email: "reader@example.com", update_opt_in: true },
      { subscriber_id: "sub-2", email: "quiet@example.com", update_opt_in: false },
    ],
    assets: [
      { asset_id: "asset-ready", title: "Agent Notes", processing_status: "ready", delivered_to: ["sub-1", "sub-2"] },
      { asset_id: "asset-pending", title: "RAG Lab", processing_status: "pending", delivered_to: ["sub-1"] },
    ],
  });

  assert.match(csv, /reader@example\.com/);
  assert.match(csv, /asset-ready/);
  assert.doesNotMatch(csv, /quiet@example\.com/);
  assert.doesNotMatch(csv, /asset-pending/);
  assert.equal(csv.trimEnd().split("\n").length, 2);
});
