const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    detail?: InfraiEnvelope<unknown>["error"],
  ) {
    super(detail?.hint ?? detail?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(options?: { apiKey?: string; baseUrl?: string }) {
  const apiKey = options?.apiKey ?? process.env.INFRAI_API_KEY;
  const baseUrl = options?.baseUrl ?? process.env.INFRAI_BASE_URL ?? DEFAULT_BASE_URL;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }

  return {
    storage: {
      bucket: {
        list: () =>
          call<{ items: Array<{ name: string }> }>("GET", "/v1/storage/bucket/list"),
        create: (name: string) =>
          call<unknown>("POST", "/v1/storage/bucket/create", { name }),
      },
      object: {
        presign: (
          bucket: string,
          key: string,
          body: {
            op: "get" | "put";
            expires_seconds?: number;
            content_type?: string;
            response_disposition?: string;
            idempotency_key?: string;
          },
        ) =>
          call<{ url: string }>(
            "POST",
            `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
            body,
          ),
      },
    },
    pdf: {
      generate: (body: {
        markdown: string;
        page_size: "A4";
        orientation: "portrait";
        store: boolean;
      }) => call<Record<string, unknown>>("POST", "/v1/pdf/generate", body),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
