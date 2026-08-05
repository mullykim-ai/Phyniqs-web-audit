import pg from "pg";import {config} from "./config.js";
export const pool=new pg.Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_URL.includes("railway")?{rejectUnauthorized:false}:undefined,max:20});
export async function query<T extends pg.QueryResultRow=pg.QueryResultRow>(text:string,values:unknown[]=[]){return pool.query<T>(text,values)}
export async function transaction<T>(run:(client:pg.PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query("BEGIN");const out=await run(client);await client.query("COMMIT");return out}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}}
