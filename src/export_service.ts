import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createCreatorExport } from "./creator_export.ts";
import { createInfraiClient, InfraiError } from "./infrai_client.ts";

const requestSchema = z.object({
  creator_id: z.string().min(1),
  export_id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  subscribers: z.array(z.object({
    subscriber_id: z.string().min(1),
    email: z.string().email(),
    update_opt_in: z.boolean(),
  })),
  assets: z.array(z.object({
    asset_id: z.string().min(1),
    title: z.string().min(1),
    processing_status: z.enum(["pending", "ready", "failed"]),
    delivered_to: z.array(z.string().min(1)),
  })),
});

const bucket = process.env.INFRAI_EXPORT_BUCKET ?? "creator-commerce-exports";
const infrai = createInfraiClient();
const bucketReady = (async () => {
  const { items } = await infrai.storage.bucket.list();
  if (!items.some((item) => item.name === bucket)) {
    try {
      await infrai.storage.bucket.create(bucket);
    } catch (error) {
      if (!(error instanceof InfraiError) || error.code !== "STORAGE_BUCKET_EXISTS") {
        throw error;
      }
    }
  }
})();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/exports") {
    send(response, 404, { error: "Route not found" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    await bucketReady;
    const result = await createCreatorExport(input, infrai, bucket);
    send(response, 201, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid export request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "Export could not be created" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Creator export service listening on http://localhost:${port}`));
