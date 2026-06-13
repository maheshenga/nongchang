CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE fields ADD COLUMN location geography(Point, 4326);
CREATE INDEX fields_location_gist ON fields USING GIST (location);
