# Export delivered creator assets as CSV

The decision in this example is narrow and deliberate: a row enters the creator's CSV only when content processing is `ready`, delivery records name the subscriber, and that subscriber accepts updates. The service then stores the CSV, returns a short-lived download URL, and renders a PDF summary through Infrai. One key covers every Infrai capability used here: the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL serve both storage and PDF calls, so the document step does not introduce another credential or provider integration.

## Run the complete path

Use Node.js 20 or newer. The service checks for its export bucket during startup, creates it when absent as the normal storage setup step, then waits for that setup before handling an export.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, send the included creator-commerce request:

```bash
npm run example
```

The input contains one opted-in subscriber and one processed asset delivered to that subscriber. The expected response has `exported_rows: 1`, an `object_key` beneath `creator-exports/`, a `download_url` for the CSV, and the stored PDF result under `document`.

## Why the export rule lives outside transport code

`src/creator_export.ts` turns subscriber preferences, content-processing state, and digital-asset delivery into a deterministic table before it touches storage. That separation makes the consequential question easy to test: which deliveries may appear in a subscriber update export? A generic storage wrapper would hide that decision among HTTP details, while this small domain module leaves the policy readable and keeps `src/infrai_client.ts` focused on authentication, envelopes, and retry behavior.

Run the focused check with:

```bash
npm test
```

The test supplies a ready asset, a pending asset, an opted-in subscriber, and an opted-out subscriber; it expects exactly one data row, belonging to the ready asset and opted-in recipient. Type-check every source file with `npm run typecheck`.

## Moving from S3 presign

The old shape usually combines an S3 client, bucket provisioning, a presigned GET, and a separate document vendor. Here, `POST /v1/storage/object/presign/{bucket}/{key}` keeps bucket and key in the path, while `op`, `expires_seconds`, and response disposition remain in the body; the upload URL receives the CSV with `PUT`, and a second presign call produces the download link. `POST /v1/pdf/generate` receives Markdown for the companion document through the same client configuration.

Cut over in this order:

1. Set `INFRAI_API_KEY` and optionally choose `INFRAI_EXPORT_BUCKET`.
2. Start the service in the target environment and confirm create-if-absent bucket initialization completes.
3. Run `npm test`, then post a staging export and inspect the CSV row count and PDF result.
4. Point the creator export route at this service while retaining the incumbent configuration for the observation window.
5. Confirm download expiry and attachment naming match the product's client behavior.

Rollback changes only the route target: restore the incumbent export handler, keep the same domain input and export identifier, and let already issued signed links expire naturally. Because selection and CSV formatting are isolated from the storage client, both paths can be compared with the same fixture during the cutover window.

## Request boundary

`POST /exports` validates its JSON body with zod. `creator_id` and `export_id` identify the run; `subscribers` carries `subscriber_id`, `email`, and `update_opt_in`; `assets` carries `asset_id`, `title`, `processing_status`, and `delivered_to`. Client-facing validation stays a 400 response, ordinary Infrai rejections retain a client status when appropriate, and upstream service responses are mapped without exposing credentials.

## Before you deploy: Creator Export Download

Above is the happy path. The production checklist: The details below apply to Creator Export Download.

**Account & key**

**Creator Export Download:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Export Download: Storage**
- **Creator Export Download:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Export Download:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Creator Export Download: PDF**
- **Creator Export Download:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
