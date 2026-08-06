import type { Page } from "playwright";
import { query } from "./db.js";
import { upload } from "./storage.js";
import type { StoreListing } from "./types.js";
export { validateStoreTarget } from "./store-policy.js";

const trustedImageHost = (hostname: string) =>
  [
    "apple.com",
    "mzstatic.com",
    "appleusercontent.com",
    "google.com",
    "googleusercontent.com",
    "gstatic.com",
    "ggpht.com",
  ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
const clean = (value: unknown, max = 4000) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export async function extractStoreListing(
  page: Page,
  scanType: "APP_STORE" | "PLAY_STORE",
): Promise<StoreListing> {
  const data = await page.evaluate(
    ({ scanType }) => {
      const meta = (key: string) =>
        document.querySelector<HTMLMetaElement>(
          `meta[property="${key}"],meta[name="${key}"]`,
        )?.content || "";
      const jsonLd =
        [...document.querySelectorAll('script[type="application/ld+json"]')]
          .flatMap((node) => {
            try {
              const parsed = JSON.parse(node.textContent || "null");
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              return [];
            }
          })
          .find(
            (item) =>
              item &&
              typeof item === "object" &&
              /SoftwareApplication|MobileApplication/i.test(
                String(item["@type"]),
              ),
          ) || {};
      const imageCandidates = [...document.images]
        .map((img) => ({
          src: img.currentSrc || img.src,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          alt: img.alt || "",
        }))
        .filter(
          (image) => image.src && image.width >= 240 && image.height >= 240,
        );
      const screenshots = imageCandidates
        .filter(
          (image) =>
            image.height >= image.width * 0.8 ||
            /screen|preview/i.test(image.alt),
        )
        .map((image) => image.src);
      const icon =
        imageCandidates.find(
          (image) => Math.abs(image.width - image.height) < 40,
        )?.src || String(jsonLd.image || meta("og:image") || "");
      const author =
        typeof jsonLd.author === "object" ? jsonLd.author?.name : jsonLd.author;
      return {
        name: String(jsonLd.name || meta("og:title") || document.title),
        developer: String(author || jsonLd.publisher?.name || ""),
        description: String(
          jsonLd.description ||
            meta("og:description") ||
            meta("description") ||
            "",
        ),
        rating: String(jsonLd.aggregateRating?.ratingValue || ""),
        version: String(jsonLd.softwareVersion || ""),
        iconUrl: icon,
        imageUrls: [...new Set(screenshots)],
        metadata: {
          storeUrl: location.href,
          applicationCategory: String(jsonLd.applicationCategory || ""),
          operatingSystem: String(jsonLd.operatingSystem || ""),
          price: String(jsonLd.offers?.price ?? ""),
          currency: String(jsonLd.offers?.priceCurrency || ""),
        },
        platform: scanType === "APP_STORE" ? "Apple App Store" : "Google Play",
      };
    },
    { scanType },
  );
  return {
    ...data,
    platform:scanType==="APP_STORE"?"Apple App Store":"Google Play",
    name: clean(data.name, 300),
    developer: clean(data.developer, 300),
    description: clean(data.description),
    rating: clean(data.rating, 30),
    version: clean(data.version, 80),
    iconUrl: data.iconUrl,
    imageUrls: data.imageUrls
      .filter((url, index, list) => list.indexOf(url) === index)
      .slice(0, 20),
    metadata: Object.fromEntries(
      Object.entries(data.metadata).map(([key, value]) => [
        key,
        clean(value, 500),
      ]),
    ),
  };
}

function imageDimensions(bytes: Uint8Array, contentType: string) {
  if (contentType.includes("png") && bytes.length > 24)
    return {
      width:
        (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
      height:
        (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
    };
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
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
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return {
          height: (bytes[offset + 5] << 8) + bytes[offset + 6],
          width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        };
      offset += Math.max(2, length + 2);
    }
  }
  return { width: null, height: null };
}

export async function persistStoreAssets(
  scanId: string,
  pageId: string | null,
  listing: StoreListing,
  listingPage?: Page,
) {
  const candidates = [
    ...(listing.iconUrl
      ? [{ url: listing.iconUrl, kind: "ICON" as const }]
      : []),
    ...listing.imageUrls.map((url) => ({ url, kind: "SCREENSHOT" as const })),
  ];
  let position = 0;
  for (const candidate of candidates.slice(0, 13)) {
    try {
      const source = new URL(candidate.url);
      if (source.protocol !== "https:" || !trustedImageHost(source.hostname))
        continue;
      const response = await fetch(source, {
        headers: { "user-agent": "PhyniqsStoreAuditor/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) continue;
      const contentType = (response.headers.get("content-type") || "").split(
        ";",
        1,
      )[0];
      if (!contentType.startsWith("image/")) continue;
      let bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 20_000_000) continue;
      let storedContentType=contentType;
      if(listingPage && !contentType.includes("jpeg")){
        const assetPage=await listingPage.context().newPage();
        try{await assetPage.setContent(`<style>html,body{margin:0;background:#fff}img{display:block;max-width:none}</style><img src=${JSON.stringify(candidate.url)}>`);const image=assetPage.locator("img");await image.waitFor({state:"visible",timeout:15_000});bytes=new Uint8Array(await image.screenshot({type:"jpeg",quality:90}));storedContentType="image/jpeg"}finally{await assetPage.close()}
      }
      const extension = "jpg";
      const objectUrl = await upload(
        `scans/${scanId}/store/${String(position).padStart(3, "0")}.${extension}`,
        bytes,
        storedContentType,
      );
      const dimensions = imageDimensions(bytes, storedContentType);
      await query(
        "INSERT INTO store_assets(scan_id,page_id,kind,source_url,object_url,content_type,width,height,position,visual_analysis) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(scan_id,source_url) DO NOTHING",
        [
          scanId,
          pageId,
          candidate.kind,
          candidate.url,
          objectUrl,
          storedContentType,
          dimensions.width,
          dimensions.height,
          position,
          JSON.stringify({
            evidenceType: "RASTER_PREVIEW",
            fontIdentification: "VISUAL_REVIEW_REQUIRED",
            exactFontMetadataAvailable: false,
          }),
        ],
      );
      position++;
    } catch {}
  }
  return position;
}
