import { useMemo, useState } from "react";
import { PhyniqsClient, type ScanResult } from "@phyniqs/core";

const stored = (key: string, fallback = "") => localStorage.getItem(key) ?? fallback;

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => stored("phyniqs-api-url", "https://scanner-api-production-1a02.up.railway.app"));
  const [token, setToken] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://example.com");
  const [risky, setRisky] = useState("");
  const [maxPages, setMaxPages] = useState(100);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready to scan");
  const client = useMemo(() => { try { return new PhyniqsClient({ baseUrl: apiUrl, accessToken: token }); } catch { return null; } }, [apiUrl, token]);

  async function scan() {
    if (!client) return setMessage("Enter a valid API address and access token");
    setBusy(true); setResult(null);
    try {
      localStorage.setItem("phyniqs-api-url", apiUrl);
      const job = await client.createScan({ url: siteUrl, maxPages, riskyFonts: risky.split(",").map(x => x.trim()).filter(Boolean), debugMode: true });
      const complete = await client.waitForScan(job.id, value => { setResult(value); setMessage(`${value.status} · ${value.progress}%`); });
      setMessage(`Completed · ${complete.pages.length} pages · ${complete.fonts.length} fonts`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Scan failed"); } finally { setBusy(false); }
  }

  async function report() {
    if (!client || !result) return;
    const blob = await client.downloadReport(result);
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "phyniqs-font-audit.pdf"; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  return <div className="shell">
    <aside><div className="brand"><span>◢</span><div><b>Phyniqs</b><small>Native Auditor</small></div></div><nav><button className="active">Overview</button><button onClick={() => document.getElementById("scan")?.scrollIntoView()}>New scan</button><button onClick={() => document.getElementById("results")?.scrollIntoView()}>Results</button></nav><p>Playwright scans run securely on Railway.</p></aside>
    <main><header><div><small>PHYNIQS INTELLIGENCE</small><h1>Typography, everywhere.</h1></div><i className={busy ? "pulse" : ""}/></header>
      <section className="config"><label>API gateway<input value={apiUrl} onChange={e => setApiUrl(e.target.value)}/></label><label>Native access token<input type="password" value={token} onChange={e => setToken(e.target.value)}/></label></section>
      <section id="scan" className="scan"><div><small>NEW PLAYWRIGHT AUDIT</small><h2>Scan a website</h2><p>Discover rendered fonts across every connected internal page and capture exact risky-font evidence.</p></div><div className="form"><label>Website URL<input value={siteUrl} onChange={e => setSiteUrl(e.target.value)}/></label><label>Risky fonts<input value={risky} onChange={e => setRisky(e.target.value)} placeholder="Arial, Helvetica"/></label><label>Maximum pages<input type="number" min={1} max={1000} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}/></label><button disabled={busy} onClick={scan}>{busy ? message : "Launch full scan →"}</button></div></section>
      <section id="results" className="results"><div className="result-head"><div><small>LIVE RESULT</small><h2>{message}</h2></div>{result?.status === "COMPLETED" && <button onClick={report}>Export PDF</button>}</div>
        <div className="metrics"><article><span>Progress</span><b>{result?.progress ?? 0}%</b></article><article><span>Pages</span><b>{result?.pages?.length ?? 0}</b></article><article><span>Fonts</span><b>{result?.fonts?.length ?? 0}</b></article><article className="risk"><span>Risk matches</span><b>{result?.riskCount ?? 0}</b></article></div>
        {result?.fonts?.length ? <div className="fonts">{result.fonts.map(font => <span key={font}>{font}</span>)}</div> : <p className="empty">Completed scan results will appear here.</p>}
        {result?.pages?.filter(page => page.riskCount > 0).map(page => <article className="page" key={page.url}><div><b>{page.title}</b><a href={page.url} target="_blank">{page.url}</a></div><strong>{page.riskCount} risks</strong>{page.screenshotUrl && <a href={page.screenshotUrl} target="_blank">View evidence ↗</a>}</article>)}
      </section>
    </main>
  </div>;
}
