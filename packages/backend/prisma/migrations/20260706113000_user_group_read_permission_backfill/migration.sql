-- Backfill default user-group read permissions before field:view / batch:view /
-- trace:view start participating in authorization. Deliberately leave
-- non-default groups untouched so restricted groups do not gain read access.

INSERT INTO "user_groups" ("id", "tenant_id", "name", "is_default", "permissions", "created_at")
SELECT
  candidate."id",
  t."id",
  candidate."name",
  true,
  '["record:create","record:view"]'::jsonb,
  CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN LATERAL (
  SELECT
    'read-default-' || t."id" || '-' || n AS "id",
    '默认权限组-' || left(t."id", 8) || '-' || n AS "name"
  FROM generate_series(1, 1000) AS n
  WHERE NOT EXISTS (
    SELECT 1
    FROM "user_groups" existing_id
    WHERE existing_id."id" = 'read-default-' || t."id" || '-' || n
  )
    AND NOT EXISTS (
      SELECT 1
      FROM "user_groups" existing_name
      WHERE existing_name."tenant_id" = t."id"
        AND existing_name."name" = '默认权限组-' || left(t."id", 8) || '-' || n
    )
  ORDER BY n
  LIMIT 1
) candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM "user_groups" g
  WHERE g."tenant_id" = t."id"
    AND g."is_default" = true
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
    SELECT 'field:view'
    UNION
    SELECT 'batch:view'
    UNION
    SELECT 'trace:view'
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
