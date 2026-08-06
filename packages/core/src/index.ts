export type ScanStatus = "QUEUED" | "SCANNING" | "COMPLETED" | "FAILED";

export interface RiskFinding {
  font: string;
  fontFamily: string;
  text: string;
  tag: string;
  xpath: string;
  selector: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
}

export interface ScanPage {
  id?: string;
  url: string;
  title: string;
  fonts: string[];
  riskCount: number;
  risks: RiskFinding[];
  screenshotUrl?: string | null;
  durationMs?: number;
  status?: string;
}

export interface ScanResult {
  id: string;
  url: string;
  status: ScanStatus;
  progress: number;
  fonts: string[];
  riskFonts: string[];
  riskCount: number;
  pages: ScanPage[];
  scannedAt: string;
  durationMs: number;
  error?: string;
}

export interface CreateScanInput {
  url: string;
  maxPages: number;
  riskyFonts: string[];
  debugMode: boolean;
}

export interface ScanJob { id: string; status: ScanStatus; }

export interface PhyniqsClientOptions {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export class PhyniqsApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "PhyniqsApiError"; }
}

export class PhyniqsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(options: PhyniqsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!/^https:\/\//.test(this.baseUrl) && !/^http:\/\/localhost(?::\d+)?$/.test(this.baseUrl)) {
      throw new Error("The API address must use HTTPS (or localhost for development)");
    }
    if (!this.accessToken) throw new Error("An API access token is required");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/native${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new PhyniqsApiError(body.error ?? `Request failed (${response.status})`, response.status);
    }
    return response.json() as Promise<T>;
  }

  createScan(input: CreateScanInput) { return this.request<ScanJob>("/scans", { method: "POST", body: JSON.stringify(input) }); }
  getScan(id: string) { return this.request<ScanResult>(`/scans/${encodeURIComponent(id)}`); }
  async downloadReport(result: ScanResult): Promise<Blob> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/native/report`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!response.ok) throw new PhyniqsApiError("Unable to generate the PDF report", response.status);
    return response.blob();
  }
  async waitForScan(id: string, onProgress: (scan: ScanResult) => void, signal?: AbortSignal): Promise<ScanResult> {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
      const scan = await this.getScan(id);
      onProgress(scan);
      if (scan.status === "COMPLETED") return scan;
      if (scan.status === "FAILED") throw new Error(scan.error ?? "Scan failed");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2_000);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Scan cancelled", "AbortError")); }, { once: true });
      });
    }
  }
}
