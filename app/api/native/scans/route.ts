import { projectId, proxy } from "../../_scanner";
import { authorizeNative, nativeCorsHeaders, withNativeCors } from "../_auth";

export function OPTIONS() { return new Response(null, { status: 204, headers: nativeCorsHeaders() }); }
export async function POST(request: Request) {
  const denied = authorizeNative(request); if (denied) return withNativeCors(denied);
  const body = await request.json();
  const upstream = await proxy("/v1/scans", { method: "POST", body: JSON.stringify({ ...body, projectId: projectId(), debugMode: Boolean(body.debugMode) }) });
  return withNativeCors(new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json" } }));
}
