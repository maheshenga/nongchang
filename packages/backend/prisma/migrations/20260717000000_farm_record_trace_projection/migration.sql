ALTER TABLE "trace_events"
ADD COLUMN "source_farm_record_id" TEXT;

CREATE UNIQUE INDEX "trace_events_source_farm_record_id_key"
ON "trace_events"("source_farm_record_id");

ALTER TABLE "trace_events"
ADD CONSTRAINT "trace_events_source_farm_record_id_fkey"
FOREIGN KEY ("source_farm_record_id") REFERENCES "farm_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
