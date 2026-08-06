import{readdir,readFile}from"node:fs/promises";import{fileURLToPath}from"node:url";import{config}from"./config.js";import{pool}from"./db.js";
const directory=fileURLToPath(new URL("../sql/",import.meta.url));
for(const file of(await readdir(directory)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort())await pool.query(await readFile(`${directory}/${file}`,"utf8"));
await pool.query("INSERT INTO projects(id,name) VALUES($1,'Phyniqs Web Auditor') ON CONFLICT(id) DO NOTHING",[config.PHYNIQS_PROJECT_ID]);
await pool.end();
console.log("Database migration complete");
