-- Backfill a default record-permission group for existing tenants before
-- record:create / record:view start participating in authorization.

INSERT INTO "user_groups" ("id", "tenant_id", "name", "is_default", "permissions", "created_at")
SELECT
  'record-default-' || t."id",
  t."id",
  '默认用户组',
  true,
  '["record:create","record:view"]'::jsonb,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "user_groups" g
  WHERE g."tenant_id" = t."id"
    AND g."is_default" = true
)
ON CONFLICT ("tenant_id", "name") DO NOTHING;

UPDATE "user_groups" g
SET "is_default" = true
WHERE g."name" = '默认用户组'
  AND NOT EXISTS (
    SELECT 1
    FROM "user_groups" d
    WHERE d."tenant_id" = g."tenant_id"
      AND d."is_default" = true
  );

UPDATE "user_groups" g
SET "permissions" = (
  SELECT jsonb_agg(p."permission" ORDER BY p."permission")
  FROM (
    SELECT DISTINCT value #>> '{}' AS "permission"
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(g."permissions") = 'array' THEN g."permissions"
        ELSE '[]'::jsonb
      END
    )
    WHERE jsonb_typeof(value) = 'string'
    UNION
    SELECT 'record:create'
    UNION
    SELECT 'record:view'
  ) p
)
WHERE g."is_default" = true;

WITH default_groups AS (
  SELECT DISTINCT ON ("tenant_id") "tenant_id", "id"
  FROM "user_groups"
  WHERE "is_default" = true
  ORDER BY "tenant_id", "created_at" ASC, "id" ASC
)
UPDATE "users" u
SET "group_id" = dg."id"
FROM default_groups dg
WHERE u."tenant_id" = dg."tenant_id"
  AND u."group_id" IS NULL
  AND u."role" = 'merchant'::"Role"
  AND u."status" = 'active';
