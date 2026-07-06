DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "wx_openid" IS NOT NULL
    GROUP BY "tenant_id", "wx_openid"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create tenant-scoped wx_openid uniqueness: duplicate (tenant_id, wx_openid) rows exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "users_wx_openid_key";

CREATE UNIQUE INDEX "users_tenant_id_wx_openid_key"
  ON "users"("tenant_id", "wx_openid");
