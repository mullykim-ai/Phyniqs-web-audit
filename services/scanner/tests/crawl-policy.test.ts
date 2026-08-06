import{describe,expect,it}from"vitest";
import{isCrawlablePageUrl,isDownloadNavigationError,isHtmlContentType}from"../src/crawl-policy.js";
import{readFileSync}from"node:fs";
import{fileURLToPath}from"node:url";

const scanner=readFileSync(fileURLToPath(new URL("../src/scanner.ts",import.meta.url)),"utf8");

describe("HTML-only crawl policy",()=>{
  it.each(["report.pdf","font.otf","font.woff2","photo.jpg","archive.zip","feed.xml"])("rejects downloadable resource %s",path=>{
    expect(isCrawlablePageUrl(new URL(`https://example.com/${path}?download=1`))).toBe(false);
  });

  it.each(["/","/en","/about/","/article.html","/products?id=4"])("allows webpage %s",path=>{
    expect(isCrawlablePageUrl(new URL(path,"https://example.com"))).toBe(true);
  });

  it("accepts only HTML response types",()=>{
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/xhtml+xml")).toBe(true);
    expect(isHtmlContentType("application/pdf")).toBe(false);
    expect(isHtmlContentType("font/otf")).toBe(false);
  });

  it("recognizes Playwright download navigation errors",()=>{
    expect(isDownloadNavigationError(new Error("page.goto: Download is starting"))).toBe(true);
  });

  it("records a failed page instead of aborting the entire crawl",()=>{
    expect(scanner).toContain('title:"Page unavailable"');
    expect(scanner).toContain('pageFailed:true');
    expect(scanner).toContain('failed?"FAILED":"COMPLETED"');
    expect(scanner).toContain("attempt<3");
  });
});
