DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id
    FROM user_groups
    WHERE is_default = true
    GROUP BY tenant_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'user_groups_multiple_defaults';
  END IF;
END $$;

CREATE UNIQUE INDEX "user_groups_one_default_per_tenant"
ON "user_groups" ("tenant_id")
WHERE "is_default" = true;
