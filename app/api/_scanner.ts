function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} is not configured`);return value}
export function scannerUrl(path:string){return new URL(path,required("RAILWAY_SCANNER_URL")).href}
export function scannerHeaders(extra:HeadersInit={}){return{authorization:`Bearer ${required("RAILWAY_SCANNER_TOKEN")}`,"content-type":"application/json",...extra}}
export function projectId(){return required("PHYNIQS_PROJECT_ID")}
export async function proxy(path:string,init:RequestInit={}){try{return await fetch(scannerUrl(path),{...init,headers:scannerHeaders(init.headers),signal:AbortSignal.timeout(30_000)})}catch(error){return Response.json({error:error instanceof Error?error.message:"Scanner service unavailable"},{status:503})}}
