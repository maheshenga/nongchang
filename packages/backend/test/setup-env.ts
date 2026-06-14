// 全局测试环境引导：在任何测试文件 import 应用模块之前执行。
// AppModule 中的 CryptoModule 会 fail-fast 校验 APP_ENCRYPTION_KEY，
// 此处注入一个合法的 32 字节(hex64)测试密钥，避免 e2e 启动即崩。
process.env.APP_ENCRYPTION_KEY ||= '0'.repeat(64);
