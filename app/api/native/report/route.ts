import { authorizeNative, nativeCorsHeaders, withNativeCors } from "../_auth";
import { POST as createReport } from "../../report/route";

export function OPTIONS() { return new Response(null, { status: 204, headers: nativeCorsHeaders() }); }
export async function POST(request: Request) {
  const denied = authorizeNative(request); if (denied) return withNativeCors(denied);
  return withNativeCors(await createReport(request));
}
