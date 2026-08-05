import{Worker}from"bullmq";import{config}from"./config.js";import{redis}from"./queue.js";import{runScan}from"./scanner.js";import type{ScanInput}from"./types.js";
const worker=new Worker<ScanInput>("phyniqs-scans",async job=>runScan(job.data),{connection:redis,concurrency:config.SCANNER_CONCURRENCY,lockDuration:300_000,stalledInterval:60_000,maxStalledCount:2});
worker.on("completed",job=>console.log(JSON.stringify({event:"completed",scanId:job.id})));worker.on("failed",(job,error)=>console.error(JSON.stringify({event:"failed",scanId:job?.id,error:error.message})));
for(const signal of["SIGTERM","SIGINT"]){process.on(signal,async()=>{await worker.close();await redis.quit();process.exit(0)})}
