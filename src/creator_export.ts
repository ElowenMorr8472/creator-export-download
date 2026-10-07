import type { InfraiClient } from "./infrai_client.ts";

export type CreatorExportInput = {
  creator_id: string;
  export_id: string;
  subscribers: Array<{
    subscriber_id: string;
    email: string;
    update_opt_in: boolean;
  }>;
  assets: Array<{
    asset_id: string;
    title: string;
    processing_status: "pending" | "ready" | "failed";
    delivered_to: string[];
  }>;
};

export type ExportGateway = Pick<InfraiClient, "storage" | "pdf">;

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildDeliveredAssetCsv(input: CreatorExportInput): string {
  const optedIn = new Map(
    input.subscribers
      .filter((subscriber) => subscriber.update_opt_in)
      .map((subscriber) => [subscriber.subscriber_id, subscriber]),
  );
  const rows = [["subscriber_id", "email", "asset_id", "asset_title", "delivery_status"]];

  for (const asset of input.assets) {
    if (asset.processing_status !== "ready") continue;
    for (const subscriberId of asset.delivered_to) {
      const subscriber = optedIn.get(subscriberId);
      if (!subscriber) continue;
      rows.push([
        subscriber.subscriber_id,
        subscriber.email,
        asset.asset_id,
        asset.title,
        "delivered",
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function createCreatorExport(
  input: CreatorExportInput,
  infrai: ExportGateway,
  bucket: string,
): Promise<{ download_url: string; object_key: string; exported_rows: number; document: Record<string, unknown> }> {
  const csv = buildDeliveredAssetCsv(input);
  const exportedRows = Math.max(0, csv.trimEnd().split("\n").length - 1);
  const objectKey = `creator-exports/${input.creator_id}/${input.export_id}.csv`;
  const upload = await infrai.storage.object.presign(bucket, objectKey, {
    op: "put",
    expires_seconds: 300,
    content_type: "text/csv; charset=utf-8",
    idempotency_key: input.export_id,
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: csv,
  });
  if (!uploadResponse.ok) throw new Error(`CSV upload returned HTTP ${uploadResponse.status}`);

  const download = await infrai.storage.object.presign(bucket, objectKey, {
    op: "get",
    expires_seconds: 900,
    response_disposition: `attachment; filename="${input.export_id}.csv"`,
  });
  const document = await infrai.pdf.generate({
    markdown: `# Creator export\n\nCreator: ${input.creator_id}\n\nDelivered rows: ${exportedRows}`,
    page_size: "A4",
    orientation: "portrait",
    store: true,
  });
  return { download_url: download.url, object_key: objectKey, exported_rows: exportedRows, document };
}
