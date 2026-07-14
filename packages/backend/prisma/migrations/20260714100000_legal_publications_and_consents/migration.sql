CREATE TABLE "legal_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "operator_name" TEXT NOT NULL,
  "contact_address" TEXT NOT NULL,
  "privacy_contact" TEXT NOT NULL,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "privacy_version" TEXT NOT NULL,
  "agreement_version" TEXT NOT NULL,
  "effective_date" DATE NOT NULL,
  "privacy_policy_text" TEXT NOT NULL,
  "user_agreement_text" TEXT NOT NULL,
  "current_publication_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legal_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_publications" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "operator_name" TEXT NOT NULL,
  "contact_address" TEXT NOT NULL,
  "privacy_contact" TEXT NOT NULL,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "privacy_version" TEXT NOT NULL,
  "agreement_version" TEXT NOT NULL,
  "effective_date" DATE NOT NULL,
  "privacy_policy_text" TEXT NOT NULL,
  "user_agreement_text" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_consents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "publication_id" TEXT NOT NULL,
  "privacy_version" TEXT NOT NULL,
  "agreement_version" TEXT NOT NULL,
  "client" TEXT NOT NULL DEFAULT 'miniapp',
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_settings_tenant_id_key" ON "legal_settings"("tenant_id");
CREATE UNIQUE INDEX "legal_settings_current_publication_id_key" ON "legal_settings"("current_publication_id");
CREATE UNIQUE INDEX "legal_publications_tenant_id_privacy_version_agreement_version_key"
  ON "legal_publications"("tenant_id", "privacy_version", "agreement_version");
CREATE INDEX "legal_publications_tenant_id_published_at_idx"
  ON "legal_publications"("tenant_id", "published_at");
CREATE UNIQUE INDEX "legal_consents_user_id_publication_id_client_key"
  ON "legal_consents"("user_id", "publication_id", "client");
CREATE INDEX "legal_consents_tenant_id_user_id_accepted_at_idx"
  ON "legal_consents"("tenant_id", "user_id", "accepted_at");

ALTER TABLE "legal_settings"
  ADD CONSTRAINT "legal_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_publications"
  ADD CONSTRAINT "legal_publications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_consents"
  ADD CONSTRAINT "legal_consents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_consents"
  ADD CONSTRAINT "legal_consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_consents"
  ADD CONSTRAINT "legal_consents_publication_id_fkey"
  FOREIGN KEY ("publication_id") REFERENCES "legal_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legal_settings"
  ADD CONSTRAINT "legal_settings_current_publication_id_fkey"
  FOREIGN KEY ("current_publication_id") REFERENCES "legal_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_legal_current_publication_consistency() RETURNS trigger AS $$
BEGIN
  IF NEW.current_publication_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM legal_publications p
    WHERE p.id = NEW.current_publication_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_legal_current_publication' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_legal_current_publication
AFTER INSERT OR UPDATE OF tenant_id, current_publication_id ON legal_settings
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_legal_current_publication_consistency();

CREATE FUNCTION enforce_legal_consent_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users u
    JOIN legal_publications p ON p.id = NEW.publication_id
    WHERE u.id = NEW.user_id
      AND u.tenant_id = NEW.tenant_id
      AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_legal_consent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_legal_consent
AFTER INSERT OR UPDATE OF tenant_id, user_id, publication_id ON legal_consents
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_legal_consent_consistency();
