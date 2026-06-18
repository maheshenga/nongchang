-- 支付宝交易号唯一约束:防止同一笔交易重复回调击穿 settleOrder 幂等。
-- trade_no 可空(manual 兜底入账不记交易号),Postgres 唯一索引对多个 NULL 视为互不相同,故不影响 manual 订单。
CREATE UNIQUE INDEX "credit_orders_trade_no_key" ON "credit_orders"("trade_no");
