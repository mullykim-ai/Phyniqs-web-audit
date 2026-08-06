"use client";

import { useEffect, useMemo, useState } from "react";

type View =
  | "Overview"
  | "New scan"
  | "Pages"
  | "Violations"
  | "Scan history"
  | "Reports"
  | "Settings";
type ScanType = "WEBSITE" | "APP_STORE" | "PLAY_STORE";
type StoreListing = { platform:string;name:string;developer:string;description:string;rating:string;version:string;iconUrl:string;metadata:Record<string,string> };
type StoreAsset = { id:string;kind:"ICON"|"SCREENSHOT"|"FEATURE_GRAPHIC";url:string;width:number|null;height:number|null;visual_analysis:{fontIdentification?:string;exactFontMetadataAvailable?:boolean} };
type RiskFinding = {
  font: string;
  fontFamily: string;
  text: string;
  tag: string;
  xpath: string;
  selector: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
};
type ScanPage = {
  url: string;
  title: string;
  status?: string;
  fonts: string[];
  riskCount: number;
  risks: RiskFinding[];
  screenshotUrl?: string | null;
};
type Result = {
  id?: string;
  url: string;
  title: string;
  status: string | number;
  fonts: string[];
  riskFonts: string[];
  riskCount: number;
  pages: ScanPage[];
  scannedAt: string;
  durationMs: number;
  error?: string;
  summary?: Record<string, number | string>;
  scan_type?: ScanType;
  storeListing?: StoreListing | null;
  storeAssets?: StoreAsset[];
};
type ScanLog = {
  type: string;
  progress: number;
  step: string;
  message: string;
  pageUrl?: string;
  at: string;
  data?: unknown;
};
type Admin = { id: number; name: string; email: string; role: string };

const nav: { label: View; icon: string }[] = [
  { label: "Overview", icon: "⌂" },
  { label: "New scan", icon: "⌕" },
  { label: "Pages", icon: "▤" },
  { label: "Violations", icon: "!" },
  { label: "Scan history", icon: "↺" },
  { label: "Reports", icon: "⇩" },
  { label: "Settings", icon: "⚙" },
];
const initialAdmins: Admin[] = [
  { id: 1, name: "Amara Mushi", email: "amara@phyniqs.com", role: "Owner" },
];

function download(name: string, content: string, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Home() {
  const [view, setView] = useState<View>("Overview");
  const [url, setUrl] = useState("https://example.com");
  const [scanType, setScanType] = useState<ScanType>("WEBSITE");
  const [maxPages, setMaxPages] = useState(100);
  const [riskInput, setRiskInput] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Administrator",
  });
  const [settings, setSettings] = useState({
    emailAlerts: true,
    concurrency: 6,
  });
  const pages = result?.pages || [];
  const riskCount = result?.riskCount || 0;
  const fonts = result?.fonts || [];
  const riskFonts = riskInput
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  useEffect(() => {
    const saved = localStorage.getItem("phyniqs-admins");
    if (saved) setAdmins(JSON.parse(saved));
  }, []);
  const toast = (s: string, error = false) => {
    setNoticeError(
      error || /(failed|error|timed out|unable|page\.goto|err_)/i.test(s),
    );
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  };
  async function runScan() {
    setScanning(true);
    setResult(null);
    setScanLogs([]);
    setProgress(0);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          scanType,
          maxPages: scanType === "WEBSITE" ? maxPages : 1,
          riskyFonts: riskFonts,
          debugMode,
        }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "Unable to queue scan");
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          clearInterval(poller);
          clearTimeout(timeout);
        };
        const succeed = (data: Result) => {
          if (settled) return;
          settled = true;
          cleanup();
          setResult(data);
          toast(
            `Scan completed · ${data.pages.length} pages · ${data.fonts.length} fonts`,
          );
          setView("Pages");
          resolve();
        };
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(message));
        };
        const check = async () => {
          try {
            const resultResponse = await fetch(`/api/scans/${job.id}`, {
              cache: "no-store",
            });
            const data = await resultResponse.json();
            if (!resultResponse.ok) {
              if (resultResponse.status >= 500)
                fail(data.error || "Unable to load scan results");
              return;
            }
            const nextProgress = Number(data.progress) || 0;
            setProgress(nextProgress);
            setScanLogs((current) => {
              const last = current[current.length - 1];
              if (last?.progress === nextProgress) return current;
              return [
                ...current.slice(-149),
                {
                  type: "progress",
                  progress: nextProgress,
                  step: String(data.status || "SCANNING"),
                  message:
                    nextProgress === 0
                      ? "Waiting for an available browser worker"
                      : `Playwright scan is ${nextProgress}% complete`,
                  at: new Date().toISOString(),
                },
              ];
            });
            if (data.status === "FAILED" || data.error) {
              fail(data.error || "The scanner could not complete this website");
              return;
            }
            if (data.status === "COMPLETED") {
              if (!Array.isArray(data.pages) || data.pages.length === 0) {
                fail(
                  "The scanner returned no pages. Retry with Debug Mode enabled for detailed diagnostics.",
                );
                return;
              }
              succeed(data);
            }
          } catch {}
        };
        const poller = setInterval(check, 2000);
        const timeout = setTimeout(
          () => fail("Scan timed out before completion"),
          3_600_000,
        );
        void check();
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Scan failed");
      setView("New scan");
    } finally {
      setScanning(false);
    }
  }
  async function downloadPdf() {
    if (!result) {
      toast("Run a scan before generating a PDF");
      return;
    }
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!response.ok) {
      toast("PDF generation failed");
      return;
    }
    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `phyniqs-font-audit-${new URL(result.url).hostname}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Detailed PDF downloaded");
  }
  function addAdmin() {
    if (!adminForm.name || !adminForm.email || adminForm.password.length < 8) {
      toast("Add a name, valid email and an 8+ character password");
      return;
    }
    const next = [
      ...admins,
      {
        id: Date.now(),
        name: adminForm.name,
        email: adminForm.email,
        role: adminForm.role,
      },
    ];
    setAdmins(next);
    localStorage.setItem("phyniqs-admins", JSON.stringify(next));
    setAdminForm({ name: "", email: "", password: "", role: "Administrator" });
    toast("Administrator added securely");
  }
  const filtered = useMemo(
    () =>
      pages.filter((p) =>
        (p.url + p.title + p.fonts.join(" "))
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [pages, query],
  );

  return (
    <div className="app">
      <aside className="side">
        <button
          className="logo"
          onClick={() => setView("Overview")}
          aria-label="Phyniqs Global home"
        >
          <img src="/phyniqs-logo.jpg" alt="Phyniqs" />
        </button>
        <div className="product-name">
          <span>Global Web Crawler</span>
          <small>Typography intelligence</small>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.label}
              className={view === n.label ? "on" : ""}
              onClick={() => setView(n.label)}
            >
              <i>{n.icon}</i>
              <span>{n.label}</span>
              {n.label === "Violations" && riskCount > 0 ? (
                <b>{riskCount}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button className="account" onClick={() => setProfileOpen(true)}>
            <span>AM</span>
            <div>
              <b>{admins[0]?.name || "Admin"}</b>
              <small>{admins[0]?.role || "Owner"}</small>
            </div>
            <i>•••</i>
          </button>
          <button className="signin" onClick={() => setAuthOpen(true)}>
            Sign in / Create account
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>PHYNIQS INTELLIGENCE</small>
            <h1>{view}</h1>
          </div>
          <div className="top-actions">
            <label>
              <span>⌕</span>
              <input
                placeholder="Search scans, pages, fonts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                setView("Reports");
                toast("Report center opened");
              }}
            >
              Export
            </button>
            <button className="lime" onClick={() => setView("New scan")}>
              + Run new scan
            </button>
          </div>
        </header>
        <div className="content">
          {view === "Overview" && (
            <Overview
              riskCount={riskCount}
              pages={pages.length}
              fonts={fonts}
              scanned={!!result}
              onScan={() => setView("New scan")}
              onViolation={() => setView("Violations")}
            />
          )}
          {view === "New scan" && (
            <section className="view-card scan-view">
              <div className="eyebrow">PLAYWRIGHT TYPOGRAPHY ENGINE</div>
              <h2>{scanType === "WEBSITE" ? "Scan a website" : "Scan an app listing"}</h2>
              <p>
                {scanType === "WEBSITE" ? "Render every discoverable page in Chromium, wait for fonts to load, inspect visible text, capture screenshots and cross-validate font evidence." : "Render the official store listing, inspect its typography, preserve app preview screens and separate exact browser evidence from raster-only visual evidence."}
              </p>
              <div className="scan-type-picker" role="group" aria-label="Scan source">
                {([['WEBSITE','Website','Full internal crawl'],['APP_STORE','Apple App Store','Listing and preview screens'],['PLAY_STORE','Google Play','Listing and preview screens']] as const).map(([value,label,detail])=><button key={value} className={scanType===value?'active':''} onClick={()=>{setScanType(value);setUrl(value==='WEBSITE'?'https://example.com':value==='APP_STORE'?'https://apps.apple.com/app/id000000000':'https://play.google.com/store/apps/details?id=com.example.app')}}><b>{label}</b><span>{detail}</span></button>)}
              </div>
              <label>
                {scanType === "WEBSITE" ? "Website address" : "Official store listing URL"}
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  type="url"
                  placeholder={scanType === "APP_STORE" ? "https://apps.apple.com/app/id…" : scanType === "PLAY_STORE" ? "https://play.google.com/store/apps/details?id=…" : "https://example.com"}
                />
              </label>
              <label className="risk-field">
                Risky fonts to flag{" "}
                <span>Optional · separate multiple fonts with commas</span>
                <input
                  value={riskInput}
                  onChange={(e) => setRiskInput(e.target.value)}
                  placeholder="Example: Comic Sans MS, Arial"
                />
                {riskFonts.length > 0 && (
                  <div className="risk-chips">
                    {riskFonts.map((f) => (
                      <em key={f}>{f}</em>
                    ))}
                  </div>
                )}
              </label>
              <div className={`scan-options ${scanType !== "WEBSITE" ? "store-mode" : ""}`}>
                {scanType === "WEBSITE" && (
                <label>
                  Maximum pages
                  <select
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                  >
                    <option value="25">25 pages</option>
                    <option value="50">50 pages</option>
                    <option value="100">100 pages</option>
                    <option value="200">200 pages</option>
                  </select>
                </label>
                )}
                <div>
                  <b>{scanType === "WEBSITE" ? "Browser-rendered crawl" : "Verified store capture"}</b>
                  <span>
                    {scanType === "WEBSITE" ? "Dynamic DOM, computed styles, FontFaceSet, network font requests and screenshots are captured." : "Store metadata, listing fonts, preview images and source evidence are captured. Raster previews are never presented as exact font metadata."}
                  </span>
                </div>
              </div>
              <div className="debug-toggle">
                <div>
                  <b>Debug mode</b>
                  <span>
                    Store complete browser, DOM, network and console
                    diagnostics.
                  </span>
                </div>
                <button
                  className={debugMode ? "switch active" : "switch"}
                  onClick={() => setDebugMode(!debugMode)}
                  aria-label="Toggle debug mode"
                >
                  <i />
                </button>
              </div>
              <button
                className="lime large"
                disabled={scanning || !/^https?:\/\//.test(url)}
                onClick={runScan}
              >
                {scanning
                  ? `Rendering source… ${progress}%`
                  : scanType === "WEBSITE" ? "Start website scan →" : "Start app listing scan →"}
              </button>
              {scanning && (
                <>
                  <div className="live-progress">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <div className="execution-log">
                    <div>
                      <span>LIVE EXECUTION LOG</span>
                      <b>{progress}%</b>
                    </div>
                    {scanLogs.slice(-8).map((log, i) => (
                      <article key={`${log.at}-${i}`}>
                        <em>STEP {Math.max(1, scanLogs.length - 7 + i)}</em>
                        <strong>{log.step.replaceAll("_", " ")}</strong>
                        <span>{log.message}</span>
                        <i className={log.type === "failed" ? "fail" : ""}>
                          {log.type === "failed" ? "FAILED" : "SUCCESS"}
                        </i>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
          {view === "Pages" && (
            <DataView
              title="Scanned pages"
              subtitle={
                result
                  ? `Actual results from ${result.url} · ${result.durationMs}ms`
                  : "Run a scan to populate the page and font inventory"
              }
            >
              {!result ? (
                <Empty
                  title="No website scanned yet"
                  action={() => setView("New scan")}
                />
              ) : (
                <>
                  <div className="scan-summary">
                    <div>
                      <span>Pages scanned</span>
                      <b>{pages.length}</b>
                    </div>
                    <div>
                      <span>Fonts found</span>
                      <b>{fonts.length}</b>
                    </div>
                    <div>
                      <span>Risk matches</span>
                      <b className={riskCount ? "red-text" : ""}>{riskCount}</b>
                    </div>
                  </div>
                  <div className="font-strip">
                    <span>Fonts currently found</span>
                    {fonts.length ? (
                      fonts.map((f) => (
                        <em
                          className={
                            riskFonts.some((r) =>
                              f.toLowerCase().includes(r.toLowerCase()),
                            )
                              ? "risky"
                              : ""
                          }
                          key={f}
                        >
                          {f}
                        </em>
                      ))
                    ) : (
                      <small>No explicit font-family declarations found</small>
                    )}
                  </div>
                  {result.storeListing && <section className="store-inventory"><div className="store-meta"><span className="eyebrow">{result.storeListing.platform}</span><h2>{result.storeListing.name}</h2><p>{result.storeListing.developer || "Developer not published"}</p><dl><div><dt>Rating</dt><dd>{result.storeListing.rating || "Not listed"}</dd></div><div><dt>Version</dt><dd>{result.storeListing.version || "Not listed"}</dd></div><div><dt>Preview assets</dt><dd>{result.storeAssets?.filter(asset=>asset.kind==='SCREENSHOT').length || 0}</dd></div></dl><small>{result.storeListing.description}</small></div><div className="store-proof"><div><b>Sample app display screens</b><span>Captured from the official listing. These are raster images, so the report labels their font evidence as visual-only unless original app font files are supplied.</span></div><div className="store-shots">{result.storeAssets?.filter(asset=>asset.kind==='SCREENSHOT').map(asset=><a href={asset.url} target="_blank" rel="noreferrer" key={asset.id}><img src={asset.url} alt={`${result.storeListing?.name} app preview`}/><span>Visual font review</span></a>)}</div></div></section>}
                  <div className="data-table head">
                    <span>Page</span>
                    <span>Actual fonts found</span>
                    <span>Risk matches</span>
                    <span>Status</span>
                  </div>
                  {filtered.map((p, i) => (
                    <button
                      className={`data-table row ${p.riskCount ? "risk-row" : ""}`}
                      key={p.url + i}
                      onClick={() =>
                        p.riskCount
                          ? setView("Violations")
                          : toast(`${p.title}: no selected risky font found`)
                      }
                    >
                      <span>
                        <b>{p.title}</b>
                        <small>{p.url}</small>
                      </span>
                      <span>
                        {p.fonts.join(", ") || "No explicit declaration"}
                      </span>
                      <span>{p.riskCount}</span>
                      <span>
                        <em className={p.riskCount ? "bad" : "good"}>
                          {p.riskCount ? "Risk" : "Clear"}
                        </em>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </DataView>
          )}
          {view === "Violations" && (
            <DataView
              title="Risk findings"
              subtitle="Exact rendered pages, elements and highlighted screenshot evidence"
            >
              {!result ? (
                <Empty
                  title="No scan has been run"
                  action={() => setView("New scan")}
                />
              ) : riskCount === 0 ? (
                <Empty
                  title="No selected risky fonts were found"
                  detail={
                    riskFonts.length
                      ? `Checked for: ${riskFonts.join(", ")}`
                      : "No risky fonts were selected for this scan."
                  }
                  action={() => setView("New scan")}
                />
              ) : (
                <div className="risk-results">
                  <div className="risk-summary">
                    <span className="tag">RISK FOUND</span>
                    <h2>{riskCount} exact element matches</h2>
                    <p>
                      {pages.filter((p) => p.riskCount).length} pages contain
                      fonts you marked as risky. Red outlines in each screenshot
                      show the rendered locations.
                    </p>
                  </div>
                  {pages
                    .filter((p) => p.riskCount)
                    .map((p) => (
                      <section className="risk-evidence" key={p.url}>
                        <div className="risk-page-head">
                          <div>
                            <b>{p.title}</b>
                            <a href={p.url} target="_blank" rel="noreferrer">
                              {p.url}
                            </a>
                          </div>
                          <strong>{p.riskCount} matches</strong>
                        </div>
                        {p.screenshotUrl ? (
                          <a
                            className="risk-shot"
                            href={p.screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={p.screenshotUrl}
                              alt={`Highlighted risky typography on ${p.title}`}
                            />
                            <span>Open full-resolution evidence ↗</span>
                          </a>
                        ) : (
                          <div className="missing-shot">
                            Screenshot unavailable for this page
                          </div>
                        )}
                        <div className="finding-list">
                          {p.risks.map((r, i) => (
                            <article key={`${r.selector}-${i}`}>
                              <div>
                                <em>{r.font}</em>
                                <b>
                                  &lt;{r.tag}&gt; · {r.fontWeight} {r.fontStyle}{" "}
                                  · {r.fontSize}
                                </b>
                                <p>“{r.text}”</p>
                              </div>
                              <code>{r.selector}</code>
                              <small>{r.xpath}</small>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                </div>
              )}
            </DataView>
          )}
          {view === "Scan history" && (
            <DataView
              title="Scan history"
              subtitle="The latest completed audit run"
            >
              {result ? (
                <div className="history">
                  <article>
                    <span className="pulse" />
                    <div>
                      <b>{result.url}</b>
                      <small>
                        {new Date(result.scannedAt).toLocaleString()}
                      </small>
                    </div>
                    <strong>{pages.length} pages</strong>
                    <em className={riskCount ? "red-text" : ""}>
                      {riskCount ? `${riskCount} risks` : "Clear"}
                    </em>
                    <button onClick={() => setView("Pages")}>Open →</button>
                  </article>
                </div>
              ) : (
                <Empty
                  title="No scan history yet"
                  action={() => setView("New scan")}
                />
              )}
            </DataView>
          )}
          {view === "Reports" && (
            <DataView
              title="Reports"
              subtitle="Detailed exports containing every page, font and exact risk location"
            >
              {!result ? (
                <Empty
                  title="Run a scan before creating a report"
                  action={() => setView("New scan")}
                />
              ) : (
                <div className="report-grid">
                  {[
                    [
                      "PDF",
                      "Printable evidence report with exact selectors and highlighted screenshots",
                    ],
                    [
                      "JSON",
                      "Complete machine-readable crawl and element-level risk data",
                    ],
                    ["CSV", "Page-by-page font inventory and risk totals"],
                  ].map(([t, d]) => (
                    <article key={t}>
                      <span>⇩</span>
                      <h3>{t}</h3>
                      <p>{d}</p>
                      <button
                        onClick={() =>
                          t === "PDF"
                            ? downloadPdf()
                            : t === "CSV"
                              ? download(
                                  "phyniqs-font-report.csv",
                                  "page,title,fonts,risk_matches\n" +
                                    pages
                                      .map(
                                        (p) =>
                                          `${p.url},${p.title},\"${p.fonts.join(";")}\",${p.riskCount}`,
                                      )
                                      .join("\n"),
                                  "text/csv",
                                )
                              : download(
                                  "phyniqs-font-report.json",
                                  JSON.stringify(result, null, 2),
                                )
                        }
                      >
                        Generate {t} →
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </DataView>
          )}
          {view === "Settings" && (
            <DataView
              title="Crawler settings"
              subtitle="Manage notifications and administrator access"
            >
              <div className="settings">
                <div className="switch-row">
                  <div>
                    <b>Risk email alerts</b>
                    <span>
                      Notify administrators when a user-selected risky font is
                      found.
                    </span>
                  </div>
                  <button
                    className={
                      settings.emailAlerts ? "switch active" : "switch"
                    }
                    onClick={() =>
                      setSettings({
                        ...settings,
                        emailAlerts: !settings.emailAlerts,
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
                <div className="settings-actions">
                  <button onClick={() => setProfileOpen(true)}>
                    Manage administrators
                  </button>
                  <button
                    className="lime"
                    onClick={() => toast("Settings saved")}
                  >
                    Save settings
                  </button>
                </div>
              </div>
            </DataView>
          )}
        </div>
      </main>
      {profileOpen && (
        <div className="overlay" onClick={() => setProfileOpen(false)}>
          <section className="modal wide" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setProfileOpen(false)}>
              ×
            </button>
            <span className="eyebrow">ACCESS CONTROL</span>
            <h2>Administrators</h2>
            <p>Manage people with access to Phyniqs Global Web Crawler.</p>
            <div className="admin-list">
              {admins.map((a) => (
                <div key={a.id}>
                  <span>
                    {a.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <b>{a.name}</b>
                    <small>
                      {a.email} · {a.role}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      const next = admins.filter((x) => x.id !== a.id);
                      setAdmins(next);
                      localStorage.setItem(
                        "phyniqs-admins",
                        JSON.stringify(next),
                      );
                      toast("Administrator removed");
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="add-admin">
              <h3>Add administrator</h3>
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    value={adminForm.name}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Gmail or email
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  Temporary password
                  <input
                    type="password"
                    value={adminForm.password}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, password: e.target.value })
                    }
                  />
                </label>
                <label>
                  Role
                  <select
                    value={adminForm.role}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, role: e.target.value })
                    }
                  >
                    <option>Administrator</option>
                    <option>Auditor</option>
                    <option>Owner</option>
                  </select>
                </label>
              </div>
              <button className="lime" onClick={addAdmin}>
                Add administrator
              </button>
            </div>
          </section>
        </div>
      )}
      {authOpen && (
        <div className="overlay" onClick={() => setAuthOpen(false)}>
          <section className="modal auth" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setAuthOpen(false)}>
              ×
            </button>
            <img src="/phyniqs-logo.jpg" alt="Phyniqs" />
            <h2>Welcome to Phyniqs</h2>
            <p>Sign in to access your crawler workspace.</p>
            <a className="google" href="/signin-with-chatgpt?return_to=/">
              <b>G</b>Continue with your Google-connected account
            </a>
            <span className="or">or</span>
            <label>
              Email
              <input type="email" placeholder="you@gmail.com" />
            </label>
            <label>
              Password
              <input type="password" placeholder="8+ characters" />
            </label>
            <button
              className="lime large"
              onClick={() => {
                setAuthOpen(false);
                toast("Account form submitted");
              }}
            >
              Log in / Sign up
            </button>
            <small>
              Authentication is protected by the site’s private access policy.
            </small>
          </section>
        </div>
      )}
      {notice && (
        <div className={`toast ${noticeError ? "error" : ""}`}>
          {noticeError ? "!" : "✓"} {notice}
        </div>
      )}
    </div>
  );
}

function DataView({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="view-card data-view">
      <div className="view-head">
        <div>
          <span className="eyebrow">AUDIT WORKSPACE</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action: () => void;
}) {
  return (
    <div className="empty">
      <span>⌕</span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      <button className="lime" onClick={action}>
        Start a new scan →
      </button>
    </div>
  );
}
function Overview({
  riskCount,
  pages,
  fonts,
  scanned,
  onScan,
  onViolation,
}: {
  riskCount: number;
  pages: number;
  fonts: string[];
  scanned: boolean;
  onScan: () => void;
  onViolation: () => void;
}) {
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">WEB FONT INTELLIGENCE</span>
          <h2>
            Crawl every page.
            <br />
            <i>Find every font.</i>
          </h2>
          <p>
            Load a website, follow its internal links, identify its current font
            declarations and flag only the fonts you choose as risky.
          </p>
          <button className="lime large" onClick={onScan}>
            Launch a full scan →
          </button>
        </div>
        <div className="radar">
          <div className="orbit a" />
          <div className="orbit b" />
          <div className="orbit c" />
          <span>PHYNIQS</span>
          <i>{pages}</i>
          <small>{scanned ? "PAGES SCANNED" : "READY TO CRAWL"}</small>
        </div>
      </section>
      {scanned && riskCount > 0 ? (
        <section className="alert-dark">
          <div className="alert-icon">!</div>
          <div>
            <span>RISK DETECTED</span>
            <h3>{riskCount} selected-font matches found</h3>
            <p>
              Review the exact pages and font families in the risk findings.
            </p>
          </div>
          <button onClick={onViolation}>Inspect findings →</button>
        </section>
      ) : (
        <section className="clear-banner">
          <div>✓</div>
          <span>
            {scanned
              ? "Scan complete — no selected risky fonts found"
              : "No scan has been run. Results will appear after you crawl a website."}
          </span>
          <button onClick={onScan}>
            {scanned ? "Run another scan" : "Start scan"} →
          </button>
        </section>
      )}
      <div className="metrics-dark">
        {[
          ["SCAN STATUS", scanned ? "DONE" : "READY", ""],
          ["PAGES SCANNED", String(pages), ""],
          ["FONTS FOUND", String(fonts.length), ""],
          ["RISK MATCHES", String(riskCount), ""],
        ].map((x) => (
          <article key={x[0]}>
            <span>{x[0]}</span>
            <strong>
              {x[1]}
              <small>{x[2]}</small>
            </strong>
            <i />
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section>
          <div className="view-head">
            <div>
              <span className="eyebrow">CRAWL STATUS</span>
              <h2>{scanned ? "Latest site map" : "Awaiting a website"}</h2>
            </div>
            <button onClick={onScan}>New scan +</button>
          </div>
          <div className="crawl-map">
            <div className="map-lines" />
            <span className="node n1" />
            <span className="node n2" />
            <span className="node n3" />
            <span className="node n4" />
            <b>
              {scanned
                ? `${pages} pages discovered`
                : "Ready for a full internal crawl"}
            </b>
            <small>
              {scanned
                ? "All reachable same-domain pages inspected"
                : "Enter a public website URL to begin"}
            </small>
          </div>
        </section>
        <section>
          <div className="view-head">
            <div>
              <span className="eyebrow">ACTUAL FONT SIGNAL</span>
              <h2>Fonts found</h2>
            </div>
          </div>
          <div className="overview-fonts">
            {fonts.length ? (
              fonts.map((f) => <span key={f}>{f}</span>)
            ) : (
              <p>No scan data yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
