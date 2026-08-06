import{describe,expect,it}from"vitest";
import{readFileSync}from"node:fs";
import{fileURLToPath}from"node:url";

const scanner=readFileSync(fileURLToPath(new URL("../src/scanner.ts",import.meta.url)),"utf8");
const server=readFileSync(fileURLToPath(new URL("../src/server.ts",import.meta.url)),"utf8");

describe("risky typography evidence",()=>{
  it("highlights matched rendered elements before taking the screenshot",()=>{
    expect(scanner).toMatch(/target\.dataset\.phyniqsRisk\s*=\s*"true"/);
    expect(scanner).toMatch(/"outline",\s*"4px solid #ff2438"/);
    expect(scanner.indexOf("dataset.phyniqsRisk")).toBeLessThan(scanner.indexOf("page.screenshot"));
  });

  it("stores screenshots as report-embeddable JPEG evidence",()=>{
    expect(scanner).toMatch(/type:\s*"jpeg",\s*quality:\s*82/);
    expect(scanner).toContain('"image/jpeg"');
  });

  it("returns exact selectors, XPath and text for every high-risk record",()=>{
    expect(server).toContain("tr.risk_level='HIGH'");
    expect(server).toMatch(/text:\s*finding\.text_snippet/);
    expect(server).toMatch(/selector:\s*finding\.selector/);
    expect(server).toMatch(/xpath:\s*finding\.xpath/);
  });
});
