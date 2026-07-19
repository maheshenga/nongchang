-- Abort before adding constraints when historical rows violate the new invariants.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fields f JOIN users u ON u.id = f.owner_id
    WHERE f.tenant_id <> u.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_field_owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supplies s JOIN users u ON u.id = s.owner_id
    WHERE s.tenant_id <> u.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_supply_owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM batches b JOIN fields f ON f.id = b.field_id
    WHERE b.tenant_id <> f.tenant_id OR b.owner_id <> f.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_batch_field_owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM farm_records fr
    JOIN batches b ON b.id = fr.batch_id
    JOIN fields f ON f.id = fr.field_id
    WHERE fr.tenant_id <> b.tenant_id
       OR fr.field_id <> b.field_id
       OR f.tenant_id <> b.tenant_id
       OR f.owner_id <> b.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_farm_record_batch_field';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM farm_records fr
    JOIN batches b ON b.id = fr.batch_id
    LEFT JOIN supplies s ON s.id = fr.supply_id
    WHERE fr.supply_id IS NOT NULL
      AND (s.id IS NULL OR s.tenant_id <> b.tenant_id OR s.owner_id <> b.owner_id)
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_farm_record_supply_owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM supply_issues si
    JOIN supplies s ON s.id = si.supply_id
    JOIN batches b ON b.id = si.batch_id
    WHERE si.tenant_id <> s.tenant_id
       OR si.tenant_id <> b.tenant_id
       OR si.owner_id <> s.owner_id
       OR si.owner_id <> b.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_supply_issue_owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM trace_codes tc LEFT JOIN batches b ON b.id = tc.batch_id
    WHERE b.id IS NULL OR tc.tenant_id <> b.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_code_batch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM trace_events te LEFT JOIN batches b ON b.id = te.batch_id
    WHERE b.id IS NULL OR te.tenant_id <> b.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_event_batch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM trace_scans ts LEFT JOIN batches b ON b.id = ts.batch_id
    WHERE b.id IS NULL OR ts.tenant_id <> b.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_scan_batch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM trace_credentials tc LEFT JOIN batches b ON b.id = tc.batch_id
    WHERE b.id IS NULL OR tc.tenant_id <> b.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_credential_batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM credit_reservations cr
    JOIN credit_accounts ca ON ca.id = cr.account_id
    WHERE cr.tenant_id <> ca.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_credit_reservation_account';
  END IF;

  IF EXISTS (
    SELECT tenant_id FROM fields WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM batches WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM farm_records WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM crop_phenologies WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM trace_codes WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM trace_events WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM trace_scans WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM trace_credentials WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM supplies WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM supply_issues WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM ai_providers WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM oss_configs WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM integration_configs WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM user_groups WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM quick_templates WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM credit_accounts WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM credit_reservations WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM credit_plans WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM credit_orders WHERE tenant_id NOT IN (SELECT id FROM tenants)
    UNION ALL SELECT tenant_id FROM ai_operations WHERE tenant_id NOT IN (SELECT id FROM tenants)
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_missing_tenant';
  END IF;
END
$$;

-- Required tenant foreign keys.
ALTER TABLE "fields" ADD CONSTRAINT "fields_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_phenologies" ADD CONSTRAINT "crop_phenologies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_codes" ADD CONSTRAINT "trace_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_events" ADD CONSTRAINT "trace_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_scans" ADD CONSTRAINT "trace_scans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_credentials" ADD CONSTRAINT "trace_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_issues" ADD CONSTRAINT "supply_issues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oss_configs" ADD CONSTRAINT "oss_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quick_templates" ADD CONSTRAINT "quick_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_plans" ADD CONSTRAINT "credit_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_orders" ADD CONSTRAINT "credit_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Relations needed for relational scope filters and supply consistency.
ALTER TABLE "trace_scans" ADD CONSTRAINT "trace_scans_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION enforce_field_owner_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = NEW.owner_id AND u.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_field_owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_field_owner
AFTER INSERT OR UPDATE OF tenant_id, owner_id ON fields
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_field_owner_consistency();

CREATE FUNCTION enforce_supply_owner_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = NEW.owner_id AND u.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_supply_owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_supply_owner
AFTER INSERT OR UPDATE OF tenant_id, owner_id ON supplies
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_supply_owner_consistency();

CREATE FUNCTION enforce_batch_field_owner_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = NEW.field_id
      AND f.tenant_id = NEW.tenant_id
      AND f.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_batch_field_owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_batch_field_owner
AFTER INSERT OR UPDATE OF tenant_id, owner_id, field_id ON batches
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_batch_field_owner_consistency();

CREATE FUNCTION enforce_farm_record_batch_field_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM batches b
    JOIN fields f ON f.id = NEW.field_id
    JOIN users u ON u.id = NEW.operator_id
    WHERE b.id = NEW.batch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.field_id = NEW.field_id
      AND f.tenant_id = NEW.tenant_id
      AND f.owner_id = b.owner_id
      AND u.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_farm_record_batch_field' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_farm_record_batch_field
AFTER INSERT OR UPDATE OF tenant_id, batch_id, field_id, operator_id ON farm_records
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_farm_record_batch_field_consistency();

CREATE FUNCTION enforce_farm_record_supply_consistency() RETURNS trigger AS $$
BEGIN
  IF NEW.supply_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM supplies s
    JOIN batches b ON b.id = NEW.batch_id
    WHERE s.id = NEW.supply_id
      AND s.tenant_id = NEW.tenant_id
      AND s.owner_id = b.owner_id
      AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_farm_record_supply_owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_farm_record_supply_owner
AFTER INSERT OR UPDATE OF tenant_id, batch_id, supply_id ON farm_records
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_farm_record_supply_consistency();

CREATE FUNCTION enforce_supply_issue_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM supplies s
    JOIN batches b ON b.id = NEW.batch_id
    WHERE s.id = NEW.supply_id
      AND s.tenant_id = NEW.tenant_id
      AND b.tenant_id = NEW.tenant_id
      AND s.owner_id = NEW.owner_id
      AND b.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_supply_issue_owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_supply_issue_owner
AFTER INSERT OR UPDATE OF tenant_id, owner_id, supply_id, batch_id ON supply_issues
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_supply_issue_consistency();

CREATE FUNCTION enforce_trace_code_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id = NEW.batch_id AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_code_batch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_trace_code_batch
AFTER INSERT OR UPDATE OF tenant_id, batch_id ON trace_codes
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_trace_code_consistency();

CREATE FUNCTION enforce_trace_event_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id = NEW.batch_id AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_event_batch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_trace_event_batch
AFTER INSERT OR UPDATE OF tenant_id, batch_id ON trace_events
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_trace_event_consistency();

CREATE FUNCTION enforce_trace_scan_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id = NEW.batch_id AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_scan_batch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_trace_scan_batch
AFTER INSERT OR UPDATE OF tenant_id, batch_id ON trace_scans
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_trace_scan_consistency();

CREATE FUNCTION enforce_trace_credential_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM batches b WHERE b.id = NEW.batch_id AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_trace_credential_batch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_trace_credential_batch
AFTER INSERT OR UPDATE OF tenant_id, batch_id ON trace_credentials
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_trace_credential_consistency();

CREATE FUNCTION enforce_credit_reservation_account_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM credit_accounts ca
    WHERE ca.id = NEW.account_id AND ca.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_credit_reservation_account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_credit_reservation_account
AFTER INSERT OR UPDATE OF tenant_id, account_id ON credit_reservations
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_credit_reservation_account_consistency();
