import { proxy } from "../../../_scanner";
import { authorizeNative, nativeCorsHeaders, withNativeCors } from "../../_auth";

export function OPTIONS() { return new Response(null, { status: 204, headers: nativeCorsHeaders() }); }
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeNative(request); if (denied) return withNativeCors(denied);
  const { id } = await params;
  const upstream = await proxy(`/v1/scans/${encodeURIComponent(id)}`);
  return withNativeCors(new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" } }));
}
