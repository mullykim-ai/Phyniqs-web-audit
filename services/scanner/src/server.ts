import crypto from "node:crypto";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { z } from "zod";
import { config } from "./config.js";
import { query } from "./db.js";
import { scanQueue } from "./queue.js";
import { download } from "./storage.js";
import { generateReport } from "./report.js";
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  bodyLimit: 1_000_000,
  requestTimeout: 30_000,
});
const matchesToken = (
  supplied: string | undefined,
  expected: string | undefined,
) =>
  Boolean(
    supplied &&
      expected &&
      supplied.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)),
  );
app.addHook("onRequest", async (req, reply) => {
  if (
    req.url === "/health" ||
    /^\/v1\/pages\/[0-9a-f-]+\/screenshot\?/.test(req.url) ||
    /^\/v1\/store-assets\/[0-9a-f-]+\?/.test(req.url) ||
    (req.method === "OPTIONS" && req.url.startsWith("/api/native/"))
  )
    return;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const expected = req.url.startsWith("/api/native/")
    ? config.PHYNIQS_NATIVE_API_TOKEN
    : config.SERVICE_API_TOKEN;
  if (!matchesToken(token, expected))
    return reply
      .code(expected ? 401 : 503)
      .send({
        error: expected
          ? "Unauthorized"
          : "Native API access is not configured",
      });
});
app.addHook("onSend", async (req, reply, payload) => {
  if (req.url.startsWith("/api/native/")) {
    reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Headers", "authorization, content-type")
      .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  return payload;
});
app.options("/api/native/*", async (_, reply) => reply.code(204).send());
app.get("/health", async () => ({
  status: "ok",
  service: "phyniqs-playwright-scanner",
}));
const createSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().url(),
  scanType: z.enum(["WEBSITE", "APP_STORE", "PLAY_STORE"]).default("WEBSITE"),
  maxPages: z.number().int().min(1).max(config.MAX_PAGES).default(100),
  debugMode: z.boolean().default(false),
  riskyFonts: z.array(z.string().min(1).max(120)).max(100).default([]),
});
app.post("/v1/scans", async (req, reply) => {
  const body = createSchema.parse(req.body);
  const target = new URL(body.url);
  if (!["http:", "https:"].includes(target.protocol))
    return reply
      .code(400)
      .send({ error: "Only HTTP(S) websites can be scanned" });
  if (body.scanType === "APP_STORE" && !["apps.apple.com", "itunes.apple.com"].includes(target.hostname))
    return reply.code(400).send({ error: "Enter a valid Apple App Store listing URL" });
  if (body.scanType === "PLAY_STORE" && !(target.hostname === "play.google.com" && target.pathname.startsWith("/store/apps/details")))
    return reply.code(400).send({ error: "Enter a valid Google Play listing URL" });
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO scans(id,project_id,status,debug_mode,max_pages,risky_fonts,scan_type) VALUES($1,$2,'QUEUED',$3,$4,$5::jsonb,$6)",
    [
      id,
      body.projectId,
      body.debugMode,
      body.maxPages,
      JSON.stringify(body.riskyFonts),
      body.scanType,
    ],
  );
  await scanQueue.add(
    "scan",
    { scanId: id, ...body },
    {
      jobId: id,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
  return reply
    .code(202)
    .send({ id, status: "QUEUED", eventsUrl: `/v1/scans/${id}/events` });
});
app.get("/v1/scans/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const scan = await query(
    "SELECT s.*,w.url FROM scans s LEFT JOIN websites w ON w.id=s.website_id WHERE s.id=$1",
    [id],
  );
  if (!scan.rowCount) return reply.code(404).send({ error: "Scan not found" });
  const pages = await query(
    "SELECT p.id,p.url,p.title,p.screenshot_url,p.duration_ms,p.status,p.debug,COALESCE(array_remove(array_agg(DISTINCT tr.font_family),NULL),ARRAY[]::text[]) AS fonts,COUNT(tr.id) FILTER(WHERE tr.risk_level='HIGH')::int AS risk_count FROM pages p LEFT JOIN typography_records tr ON tr.page_id=p.id WHERE p.scan_id=$1 GROUP BY p.id ORDER BY p.url",
    [id],
  );
  const findings = await query(
    "SELECT tr.page_id,tr.text_snippet,tr.tag,tr.xpath,tr.selector,tr.font_family,tr.font_size,tr.font_weight,tr.font_style FROM typography_records tr JOIN pages p ON p.id=tr.page_id WHERE p.scan_id=$1 AND tr.risk_level='HIGH' ORDER BY p.url,tr.id",
    [id],
  );
  const discovered = await query(
    "SELECT * FROM discovered_fonts WHERE scan_id=$1 ORDER BY occurrences DESC",
    [id],
  );
  const storeAssets = await query(
    "SELECT id,kind,source_url,content_type,width,height,position,visual_analysis FROM store_assets WHERE scan_id=$1 ORDER BY position",
    [id],
  );
  const row = scan.rows[0] as Record<string, unknown>;
  const configured = Array.isArray(row.risky_fonts)
    ? row.risky_fonts.map(String)
    : [];
  const byPage = new Map<string, unknown[]>();
  for (const finding of findings.rows) {
    const stack = String(finding.font_family);
    const matched = configured.filter((font) =>
      stack
        .split(",")
        .map((x) => x.replace(/["']/g, "").trim().toLowerCase())
        .includes(font.toLowerCase()),
    );
    const item = {
      font: matched.join(", ") || stack,
      fontFamily: stack,
      text: finding.text_snippet,
      tag: finding.tag,
      xpath: finding.xpath,
      selector: finding.selector,
      fontSize: finding.font_size,
      fontWeight: finding.font_weight,
      fontStyle: finding.font_style,
    };
    byPage.set(String(finding.page_id), [
      ...(byPage.get(String(finding.page_id)) || []),
      item,
    ]);
  }
  const riskCount = pages.rows.reduce(
    (n, p) => n + Number(p.risk_count || 0),
    0,
  );
  const forwarded = String(req.headers["x-forwarded-proto"] || "https").split(
    ",",
  )[0];
  const origin = `${forwarded}://${req.headers.host}`;
  const assets = storeAssets.rows.map((asset) => {
    const signature = crypto.createHmac("sha256", config.SERVICE_API_TOKEN).update(String(asset.id)).digest("hex");
    return { ...asset, url: `${origin}/v1/store-assets/${asset.id}?signature=${signature}` };
  });
  return {
    ...row,
    riskCount,
    riskFonts: configured,
    fonts: discovered.rows.map((f) => f.family),
    discoveredFonts: discovered.rows,
    storeListing: row.scan_type === "WEBSITE" ? null : row.source_metadata || null,
    storeAssets: assets,
    pages: pages.rows.map((p) => {
      const privateShot = String(p.screenshot_url || "").startsWith("s3://");
      const signature = crypto
        .createHmac("sha256", config.SERVICE_API_TOKEN)
        .update(String(p.id))
        .digest("hex");
      return {
        ...p,
        screenshotUrl: privateShot
          ? `${origin}/v1/pages/${p.id}/screenshot?signature=${signature}`
          : p.screenshot_url,
        riskCount: Number(p.risk_count || 0),
        risks: byPage.get(String(p.id)) || [],
      };
    }),
    scannedAt: row.finished_at || row.started_at,
    durationMs: row.duration_ms || 0,
  };
});
app.post("/api/native/scans", async (req, reply) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/scans",
    headers: { authorization: `Bearer ${config.SERVICE_API_TOKEN}` },
    payload: { ...(req.body as object), projectId: config.PHYNIQS_PROJECT_ID },
  });
  return reply
    .code(response.statusCode)
    .type(response.headers["content-type"] || "application/json")
    .send(response.rawPayload);
});
app.get("/api/native/scans/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const response = await app.inject({
    method: "GET",
    url: `/v1/scans/${encodeURIComponent(id)}`,
    headers: {
      authorization: `Bearer ${config.SERVICE_API_TOKEN}`,
      host: req.headers.host || "localhost",
      "x-forwarded-proto": String(req.headers["x-forwarded-proto"] || "https"),
    },
  });
  return reply
    .code(response.statusCode)
    .type(response.headers["content-type"] || "application/json")
    .send(response.rawPayload);
});
app.post(
  "/api/native/report",
  { config: { bodyLimit: 25_000_000 } },
  async (req, reply) => {
    const pdf = await generateReport(req.body);
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        "attachment; filename=phyniqs-font-audit.pdf",
      )
      .header("Cache-Control", "no-store")
      .send(pdf);
  },
);
app.get("/v1/store-assets/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { signature } = req.query as { signature?: string };
  const expected = crypto.createHmac("sha256", config.SERVICE_API_TOKEN).update(id).digest("hex");
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return reply.code(403).send({ error: "Invalid asset signature" });
  const asset = await query("SELECT object_url FROM store_assets WHERE id=$1", [id]);
  if (!asset.rowCount) return reply.code(404).send({ error: "Store asset not found" });
  const object = await download(String(asset.rows[0].object_url));
  return reply.header("Content-Type", object.contentType).header("Cache-Control", object.cacheControl).send(object.body);
});
app.get("/v1/pages/:id/screenshot", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { signature } = req.query as { signature?: string };
  const expected = crypto
    .createHmac("sha256", config.SERVICE_API_TOKEN)
    .update(id)
    .digest("hex");
  if (
    !signature ||
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return reply.code(403).send({ error: "Invalid screenshot signature" });
  const page = await query("SELECT screenshot_url FROM pages WHERE id=$1", [
    id,
  ]);
  if (!page.rowCount || !page.rows[0].screenshot_url)
    return reply.code(404).send({ error: "Screenshot not found" });
  const object = await download(String(page.rows[0].screenshot_url));
  return reply
    .header("Content-Type", object.contentType)
    .header("Cache-Control", object.cacheControl)
    .send(object.body);
});
app.get("/v1/scans/:id/events", async (req, reply) => {
  const { id } = req.params as { id: string };
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const subscriber = new Redis(config.REDIS_URL);
  const channel = `scan:${id}`;
  await subscriber.subscribe(channel);
  const history = await subscriber.lrange(`scanlog:${id}`, 0, 99);
  history.reverse().forEach((line: string) => res.write(`data: ${line}\n\n`));
  const onMessage = (incoming: string, message: string) => {
    if (incoming === channel) res.write(`data: ${message}\n\n`);
  };
  subscriber.on("message", onMessage);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
  req.raw.on("close", () => {
    clearInterval(heartbeat);
    subscriber.off("message", onMessage);
    void subscriber.unsubscribe(channel).then(() => subscriber.quit());
  });
});
app.get("/v1/scans/:id/typography", async (req) => {
  const { id } = req.params as { id: string };
  const q = req.query as Record<string, string>;
  const limit = Math.min(Number(q.limit) || 200, 1000),
    offset = Number(q.offset) || 0;
  const rows = await query(
    "SELECT tr.*,p.url AS page_url FROM typography_records tr JOIN pages p ON p.id=tr.page_id WHERE p.scan_id=$1 AND ($2::text IS NULL OR tr.font_family ILIKE '%'||$2||'%') AND ($3::text IS NULL OR tr.risk_level=$3) ORDER BY tr.id LIMIT $4 OFFSET $5",
    [id, q.font || null, q.risk || null, limit, offset],
  );
  return { items: rows.rows, limit, offset };
});
app.get("/v1/scans/:id/fonts", async (req) => {
  const { id } = req.params as { id: string };
  return {
    items: (
      await query(
        "SELECT * FROM discovered_fonts WHERE scan_id=$1 ORDER BY occurrences DESC",
        [id],
      )
    ).rows,
  };
});
app.get("/v1/pages/:id", async (req) => {
  const { id } = req.params as { id: string };
  const page = await query("SELECT * FROM pages WHERE id=$1", [id]);
  const records = await query(
    "SELECT * FROM typography_records WHERE page_id=$1 ORDER BY id",
    [id],
  );
  const resources = await query(
    "SELECT * FROM font_resources WHERE page_id=$1",
    [id],
  );
  const faces = await query("SELECT * FROM font_faces WHERE page_id=$1", [id]);
  return {
    ...page.rows[0],
    typography: records.rows,
    fontResources: resources.rows,
    fontFaces: faces.rows,
  };
});
app.get("/v1/projects/:id/risky-fonts", async (req) => {
  const { id } = req.params as { id: string };
  return {
    items: (
      await query(
        "SELECT * FROM risky_fonts WHERE project_id=$1 ORDER BY family",
        [id],
      )
    ).rows,
  };
});
app.post("/v1/projects/:id/risky-fonts", async (req) => {
  const { id } = req.params as { id: string };
  const body = z
    .object({
      family: z.string().min(1).max(120),
      level: z.enum(["INFO", "WARNING", "HIGH"]).default("HIGH"),
    })
    .parse(req.body);
  return (
    await query(
      "INSERT INTO risky_fonts(project_id,family,level) VALUES($1,$2,$3) ON CONFLICT (project_id,(lower(family))) DO UPDATE SET level=EXCLUDED.level RETURNING *",
      [id, body.family.trim(), body.level],
    )
  ).rows[0];
});
app.delete("/v1/projects/:projectId/risky-fonts/:id", async (req) => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  await query("DELETE FROM risky_fonts WHERE id=$1 AND project_id=$2", [
    id,
    projectId,
  ]);
  return { deleted: true };
});
await app.listen({ port: config.PORT, host: "0.0.0.0" });
