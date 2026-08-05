export type RiskLevel="INFO"|"WARNING"|"HIGH"|"CRITICAL";
export interface ScanInput{scanId:string;projectId:string;url:string;maxPages:number;debugMode:boolean;riskyFonts:string[]}
export interface TypographyRecord{text:string;tag:string;xpath:string;selector:string;fontFamily:string;fontSize:string;fontWeight:string;fontStyle:string;lineHeight:string;letterSpacing:string;textTransform:string;color:string;fontStretch:string;fontVariationSettings:string;fallback:boolean;visibility:string;display:string;riskLevel:RiskLevel}
export interface FontFaceRecord{family:string;weight:string;style:string;status:string;loaded:boolean;source:string;display:string}
export interface FontResource{url:string;filename:string;status:number|null;mimeType:string;loaded:boolean;failed:boolean;durationMs:number;cacheStatus:string;headers:Record<string,string>}
export interface PageResult{url:string;title:string;startedAt:string;finishedAt:string;durationMs:number;screenshotUrl:string|null;records:TypographyRecord[];fontFaces:FontFaceRecord[];fontResources:FontResource[];links:string[];debug:Record<string,unknown>}
export interface ProgressEvent{scanId:string;type:"progress"|"log"|"complete"|"failed";progress:number;step:string;message:string;pageUrl?:string;data?:unknown;at:string}
