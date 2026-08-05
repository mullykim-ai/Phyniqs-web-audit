import {Queue} from "bullmq";import {Redis} from "ioredis";import {config} from "./config.js";import type{ProgressEvent,ScanInput}from"./types.js";
export const redis=new Redis(config.REDIS_URL,{maxRetriesPerRequest:null});
export const scanQueue=new Queue<ScanInput>("phyniqs-scans",{connection:redis});
export async function publish(event:ProgressEvent){await redis.publish(`scan:${event.scanId}`,JSON.stringify(event));await redis.lpush(`scanlog:${event.scanId}`,JSON.stringify(event));await redis.ltrim(`scanlog:${event.scanId}`,0,499);await redis.expire(`scanlog:${event.scanId}`,86400)}
