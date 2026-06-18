-- 经营金额/数量字段由 DOUBLE PRECISION 改为 DECIMAL(14,2),消除浮点累积误差(成本/售价/农资计量)。
-- 现有数据按数值精确转换,scale=2 满足金额与常见计量精度。

ALTER TABLE "batches"
  ALTER COLUMN "labor_cost" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "sell_price" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "supplies"
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "used" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "supply_issues"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "farm_records"
  ALTER COLUMN "supply_amount" SET DATA TYPE DECIMAL(14,2);
