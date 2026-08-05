import{proxy}from"../../_scanner";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const upstream=await proxy(`/v1/scans/${encodeURIComponent(id)}`);return new Response(upstream.body,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")||"application/json"}})}
