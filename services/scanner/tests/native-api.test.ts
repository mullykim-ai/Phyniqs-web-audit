import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateReport } from "../src/report.js";

const server = readFileSync(fileURLToPath(new URL("../src/server.ts", import.meta.url)), "utf8");

describe("native client API", () => {
  it("uses an independent native token and never exposes the service token", () => {
    expect(server).toContain('req.url.startsWith("/api/native/")?config.PHYNIQS_NATIVE_API_TOKEN:config.SERVICE_API_TOKEN');
    expect(server).toContain('authorization:`Bearer ${config.SERVICE_API_TOKEN}`');
  });

  it("provides scan creation, progress and PDF routes", () => {
    expect(server).toContain('app.post("/api/native/scans"');
    expect(server).toContain('app.get("/api/native/scans/:id"');
    expect(server).toContain('app.post("/api/native/report"');
  });

  it("creates a valid detailed PDF without screenshots", async () => {
    const pdf = await generateReport({
      url: "https://example.com", fonts: ["Inter"], riskFonts: ["Arial"], riskCount: 1,
      scannedAt: "2026-08-06T12:00:00.000Z", durationMs: 1250,
      pages: [{ url: "https://example.com", title: "Example", fonts: ["Inter", "Arial"], riskCount: 1, screenshotUrl: null,
        risks: [{ font: "Arial", fontFamily: "Arial, sans-serif", text: "Example text", tag: "p", xpath: "/html/body/p", selector: "body > p", fontSize: "16px", fontWeight: "400", fontStyle: "normal" }] }],
    });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString()).toContain("TYPOGRAPHY RISK EVIDENCE REPORT");
    expect(pdf.toString()).toContain("Selector: body > p");
  });
});
