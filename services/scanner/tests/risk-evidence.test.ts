import{describe,expect,it}from"vitest";
import{readFileSync}from"node:fs";
import{fileURLToPath}from"node:url";

const scanner=readFileSync(fileURLToPath(new URL("../src/scanner.ts",import.meta.url)),"utf8");
const server=readFileSync(fileURLToPath(new URL("../src/server.ts",import.meta.url)),"utf8");

describe("risky typography evidence",()=>{
  it("highlights matched rendered elements before taking the screenshot",()=>{
    expect(scanner).toContain('target.dataset.phyniqsRisk="true"');
    expect(scanner).toContain('outline","4px solid #ff2438"');
    expect(scanner.indexOf("dataset.phyniqsRisk")).toBeLessThan(scanner.indexOf("page.screenshot"));
  });

  it("stores screenshots as report-embeddable JPEG evidence",()=>{
    expect(scanner).toContain('type:"jpeg",quality:82');
    expect(scanner).toContain('"image/jpeg"');
  });

  it("returns exact selectors, XPath and text for every high-risk record",()=>{
    expect(server).toContain("tr.risk_level='HIGH'");
    expect(server).toContain("text:finding.text_snippet");
    expect(server).toContain("selector:finding.selector");
    expect(server).toContain("xpath:finding.xpath");
  });
});
