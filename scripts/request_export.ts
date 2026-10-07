export {};

const response = await fetch("http://localhost:3000/exports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    creator_id: "creator-42",
    export_id: "september-deliveries",
    subscribers: [
      { subscriber_id: "sub-1", email: "reader@example.com", update_opt_in: true },
    ],
    assets: [
      {
        asset_id: "asset-9",
        title: "Practical RAG Field Notes",
        processing_status: "ready",
        delivered_to: ["sub-1"],
      },
    ],
  }),
});

const result: unknown = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
