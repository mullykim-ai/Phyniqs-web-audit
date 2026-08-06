import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../sql/001_initial.sql", import.meta.url)),
  "utf8",
);
const appMigration = readFileSync(fileURLToPath(new URL("../sql/002_app_store_scans.sql",import.meta.url)),"utf8");

describe("scanner persistence migration", () => {
  it.each([
    "scans",
    "pages",
    "typography_records",
    "discovered_fonts",
    "font_resources",
    "font_faces",
    "debug_logs",
    "reports",
  ])("creates the %s table", (table) => {
    expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  });

  it("uses expression indexes for case-insensitive font uniqueness", () => {
    expect(migration).toContain("risky_fonts_project_family_idx");
    expect(migration).toContain("discovered_fonts_scan_family_idx");
    expect(migration).not.toContain("UNIQUE(project_id,lower(family))");
  });

  it("persists store scan metadata and preview assets",()=>{expect(appMigration).toContain("scan_type");expect(appMigration).toContain("source_metadata");expect(appMigration).toMatch(/CREATE TABLE IF NOT EXISTS store_assets\b/)});
});
