import{readFile}from"node:fs/promises";import{fileURLToPath}from"node:url";import{config}from"./config.js";import{pool}from"./db.js";
const sql=await readFile(fileURLToPath(new URL("../sql/001_initial.sql",import.meta.url)),"utf8");
await pool.query(sql);
await pool.query("INSERT INTO projects(id,name) VALUES($1,'Phyniqs Web Auditor') ON CONFLICT(id) DO NOTHING",[config.PHYNIQS_PROJECT_ID]);
await pool.end();
console.log("Database migration complete");
