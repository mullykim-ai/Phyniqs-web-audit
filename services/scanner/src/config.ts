import { z } from "zod";
const schema=z.object({
  PORT:z.coerce.number().default(8080),DATABASE_URL:z.string().url(),REDIS_URL:z.string().url(),SERVICE_API_TOKEN:z.string().min(32),PHYNIQS_NATIVE_API_TOKEN:z.string().min(32).optional(),PHYNIQS_PROJECT_ID:z.string().uuid(),
  SCANNER_CONCURRENCY:z.coerce.number().int().min(1).max(8).default(2),PAGE_CONCURRENCY:z.coerce.number().int().min(1).max(8).default(3),
  MAX_PAGES:z.coerce.number().int().min(1).max(10000).default(1000),NAVIGATION_TIMEOUT_MS:z.coerce.number().int().min(5000).default(45000),
  S3_ENDPOINT:z.string().url(),S3_REGION:z.string().default("auto"),S3_BUCKET:z.string().min(1),S3_ACCESS_KEY_ID:z.string().min(1),S3_SECRET_ACCESS_KEY:z.string().min(1),S3_PUBLIC_BASE_URL:z.string().url().optional()
});
export const config=schema.parse(process.env);
