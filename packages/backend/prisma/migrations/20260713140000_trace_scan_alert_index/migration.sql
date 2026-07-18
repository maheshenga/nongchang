CREATE INDEX "trace_scans_tenant_scanned_code_ip_idx"
ON "trace_scans" ("tenant_id", "scanned_at" DESC, "code", "ip");
