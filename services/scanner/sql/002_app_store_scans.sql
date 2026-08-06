ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_type text NOT NULL DEFAULT 'WEBSITE';
ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check;
ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check CHECK(scan_type IN('WEBSITE','APP_STORE','PLAY_STORE'));
ALTER TABLE scans ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS store_assets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK(kind IN('ICON','SCREENSHOT','FEATURE_GRAPHIC')),
  source_url text NOT NULL,
  object_url text NOT NULL,
  content_type text NOT NULL,
  width integer,
  height integer,
  position integer NOT NULL DEFAULT 0,
  visual_analysis jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scan_id,source_url)
);
CREATE INDEX IF NOT EXISTS store_assets_scan_position_idx ON store_assets(scan_id,position);
