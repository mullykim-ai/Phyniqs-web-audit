import crypto from "node:crypto";

export function authorizeNative(request: Request): Response | null {
  const configured = process.env.PHYNIQS_NATIVE_API_TOKEN?.trim();
  if (!configured) return Response.json({ error: "Native API access is not configured" }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const valid = supplied.length === configured.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
  return valid ? null : Response.json({ error: "Invalid native API access token" }, { status: 401 });
}

export function nativeCorsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
}

export function withNativeCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(nativeCorsHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
