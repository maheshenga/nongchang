-- 支付宝支付:订单记录支付渠道与支付宝交易号。
-- 支付宝应用配置复用 integration_configs(provider='alipay':app_id=支付宝appId、
-- secret_enc=应用私钥密文、api_key_enc=支付宝公钥密文),无需新增表。

ALTER TABLE "credit_orders" ADD COLUMN "pay_channel" TEXT;
ALTER TABLE "credit_orders" ADD COLUMN "trade_no" TEXT;
