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
type PageResult = {
  url: string;
  title: string;
  status?: string;
  fonts: string[];
  riskCount: number;
  risks: RiskFinding[];
  screenshotUrl?: string | null;
};
type Report = {
  url: string;
  fonts: string[];
  riskFonts: string[];
  riskCount: number;
  pages: PageResult[];
  scannedAt: string;
  durationMs: number;
  scan_type?: "WEBSITE" | "APP_STORE" | "PLAY_STORE";
  storeListing?: { platform:string;name:string;developer:string;description:string;rating:string;version:string } | null;
  storeAssets?: Array<{ id:string;kind:string;url:string }>;
};
type ImageData = { bytes: Uint8Array; width: number; height: number };
const ascii = (value: string) => new TextEncoder().encode(value);
const clean = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
const esc = (value: string) =>
  clean(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
const wrap = (value: string, max = 100) => {
  const words = clean(value).split(" "),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
};
function jpegSize(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1],
      length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    )
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    offset += Math.max(2, length + 2);
  }
  throw new Error("Unsupported screenshot");
}
async function loadImage(url?: string | null): Promise<ImageData | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return { bytes, ...jpegSize(bytes) };
  } catch {
    return null;
  }
}
function pageText(lines: string[]) {
  const commands: string[] = ["BT /F1 9 Tf 45 750 Td 13 TL"];
  for (const line of lines.flatMap((x) => wrap(x)))
    commands.push(`(${esc(line).slice(0, 130)}) Tj T*`);
  commands.push("ET");
  return commands.join("\n");
}
function reportLines(report: Report) {
  return [
    "PHYNIQS GLOBAL WEB CRAWLER",
    "TYPOGRAPHY RISK EVIDENCE REPORT",
    "",
    `Source type: ${report.scan_type || "WEBSITE"}`,
    `Source URL: ${report.url}`,
    ...(report.storeListing ? [`App: ${report.storeListing.name}`,`Platform: ${report.storeListing.platform}`,`Developer: ${report.storeListing.developer || "Not listed"}`,`Store rating: ${report.storeListing.rating || "Not listed"}`,`Version: ${report.storeListing.version || "Not listed"}`,"Raster preview screens are visual evidence only; exact font claims require app font metadata or font files."] : []),
    `Scanned: ${new Date(report.scannedAt).toUTCString()}`,
    `Duration: ${(report.durationMs / 1000).toFixed(1)} seconds`,
    `Pages scanned: ${report.pages.length}`,
    `Unique fonts found: ${report.fonts.length}`,
    `Selected risky fonts: ${report.riskFonts.join(", ") || "None"}`,
    `Exact risky elements: ${report.riskCount}`,
    "",
    "FONT INVENTORY",
    ...report.fonts.map((x) => `- ${x}`),
  ];
}
export async function POST(request: Request) {
  try {
    const report = (await request.json()) as Report;
    if (!report.url || !Array.isArray(report.pages))
      throw new Error("Invalid report data");
    const definitions = new Map<number, Array<Uint8Array>>(),
      pageIds: number[] = [];
    let next = 4;
    const addTextPage = (lines: string[]) => {
      const content = pageText(lines),
        contentId = next++,
        pageId = next++;
      definitions.set(contentId, [
        ascii(
          `<< /Length ${ascii(content).length} >>\nstream\n${content}\nendstream`,
        ),
      ]);
      definitions.set(pageId, [
        ascii(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      ]);
      pageIds.push(pageId);
    };
    const addImagePage = (image: ImageData, title: string, url: string) => {
      const imageId = next++,
        contentId = next++,
        pageId = next++;
      const scale = Math.min(540 / image.width, 690 / image.height),
        width = image.width * scale,
        height = image.height * scale,
        x = (612 - width) / 2,
        y = 35;
      const content = `BT /F1 9 Tf 36 760 Td (${esc(title).slice(0, 100)}) Tj 0 -15 Td (${esc(url).slice(0, 110)}) Tj ET\nq ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`;
      definitions.set(imageId, [
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
        ),
        image.bytes,
        ascii("\nendstream"),
      ]);
      definitions.set(contentId, [
        ascii(
          `<< /Length ${ascii(content).length} >>\nstream\n${content}\nendstream`,
        ),
      ]);
      definitions.set(pageId, [
        ascii(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      ]);
      pageIds.push(pageId);
    };
    addTextPage(reportLines(report));
    for (const [index, page] of report.pages.entries()) {
      const lines = [
        `${index + 1}. ${page.title || "Untitled page"}`,
        page.url,
        `Fonts: ${page.fonts.join(", ") || "None detected"}`,
        `Risk findings: ${page.riskCount}`,
      ];
      if (page.risks.length)
        lines.push(
          "",
          "EXACT RISK LOCATIONS",
          ...page.risks
            .slice(0, 12)
            .flatMap((r) => [
              `${r.font} | <${r.tag}> | ${r.fontWeight} ${r.fontStyle} ${r.fontSize}`,
              `Selector: ${r.selector}`,
              `Text: ${r.text.slice(0, 150)}`,
            ]),
        );
      if (page.risks.length > 12)
        lines.push(
          `+ ${page.risks.length - 12} additional findings in JSON export`,
        );
      addTextPage(lines.slice(0, 50));
      if (page.riskCount) {
        const image = await loadImage(page.screenshotUrl);
        if (image)
          addImagePage(image, `RISK EVIDENCE - ${page.title}`, page.url);
      }
    }
    for (const [index, asset] of (report.storeAssets || []).filter(asset=>asset.kind==="SCREENSHOT").slice(0,8).entries()) {
      const image=await loadImage(asset.url);
      if(image)addImagePage(image,`APP PREVIEW ${index+1} - VISUAL FONT REVIEW`,report.url);
    }
    definitions.set(1, [ascii("<< /Type /Catalog /Pages 2 0 R >>")]);
    definitions.set(2, [
      ascii(
        `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
      ),
    ]);
    definitions.set(3, [
      ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    ]);
    const chunks: Uint8Array[] = [ascii("%PDF-1.4\n")],
      offsets = [0];
    let length = chunks[0].length;
    for (let id = 1; id < next; id++) {
      offsets[id] = length;
      const head = ascii(`${id} 0 obj\n`),
        tail = ascii("\nendobj\n"),
        body = definitions.get(id) || [];
      chunks.push(head, ...body, tail);
      length +=
        head.length + tail.length + body.reduce((n, b) => n + b.length, 0);
    }
    const xref = length;
    const trailer = ascii(
      `xref\n0 ${next}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n ")
        .join(
          "\n",
        )}\ntrailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    );
    chunks.push(trailer);
    const output = new Uint8Array(length + trailer.length);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    }
    return new Response(output, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=phyniqs-font-audit.pdf",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to generate report",
      },
      { status: 400 },
    );
  }
}
