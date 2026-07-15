# PostgreSQL 灾备手册

## 目标、角色与保留

- RPO：24 小时；至少每日完成一次加密、校验并离机的备份。
- RTO：事故宣布后 4 小时内恢复经验证的只读服务。
- 主责：平台值班；30 分钟仍无可用恢复目标时升级工程负责人，RTO 有风险时升级业务事故负责人。
- 本机只保留最近 3 套已验证备份；OSS/另一主机至少保留 14 个每日不可变备份。不得删除最后一套已验证离机备份。
- 每季度保留演练证据至少 12 个月：时间、Git SHA、备份 manifest、校验和、关键行数、耗时和改进项。加密密钥不得和证据或备份放在一起。

生产数据库角色分离：API 经 PgBouncer 使用 `nongchang_app`；迁移/恢复演练直连 PostGIS 使用 `nongchang_migrator`；日常 pg_dump 使用只读 `nongchang_backup`。PostgreSQL 客户端应安装为固定版本并通过 `PG_BIN_DIR` 指定；不要把密码放在命令参数中。

## 每日备份

运行时设置 32 字节 `BACKUP_ENCRYPTION_KEY`（64 位 hex 或有效 base64），输出目录必须是仓库/发布目录之外的绝对路径：

```bash
ROOT=/www/wwwroot/farm.qingyouai.com
set -a; . "$ROOT/shared/production.env"; set +a
export DATABASE_URL='postgresql://nongchang_backup:<encoded-password>@127.0.0.1:5544/nongchang'
export BACKUP_ENCRYPTION_KEY='<runtime secret from independent secret storage>'
export PG_BIN_DIR=/absolute/path/to/postgresql16/bin
node "$ROOT/current/scripts/backup-postgres.mjs" --output-dir "$ROOT/backups" --retention 3
```

每套备份包含 AES-256-GCM 加密 custom-format dump、版本化 manifest 和 SHA-256 sidecar。命令完成后必须：

1. `sha256sum --check <timestamp>.sha256`；
2. 将三件套复制到加密的离机不可变存储；
3. 在远端重新计算 SHA-256 并与 manifest/sidecar 一致；
4. 更新备份年龄监控。最新完整备份超过 25 小时必须告警。

脚本 manifest 不包含 URL 或凭据。日志、工单同样不得记录数据库 URL、加密密钥或明文 dump。

## 季度恢复演练

恢复演练需要 `nongchang_migrator`（具备创建/删除隔离演练库权限），不能使用 API 应用账号：

```bash
export DATABASE_URL="$DIRECT_DATABASE_URL"
export BACKUP_ENCRYPTION_KEY='<runtime secret>'
export PG_BIN_DIR=/absolute/path/to/postgresql16/bin
node "$ROOT/current/scripts/verify-backup-restore.mjs" \
  --output-dir "$ROOT/shared/offsite-staging/restore-drill"
```

该命令新建 `nongchang_restore_<timestamp>`、验证 checksum/GCM、恢复、运行租户/用户/批次一致性检查，并在 `finally` 删除演练库。还要人工比较租户数、用户数、批次数和最近业务时间点，记录 RPO/RTO 实测值。

演练结束删除明文临时文件和演练数据库，只保留加密集合与脱敏证据。任何手工步骤、告警缺失、权限过大、耗时超标或密钥依赖不清都必须形成改进任务。

## 真实事故恢复

1. 宣布事故并冻结写入；保留应用、数据库、Redis、PM2 和 Nginx 日志，不要先清理现场。
2. 从离机存储选择最新的完整备份三件套，通过独立通道取得密钥，先验证 SHA-256 和 GCM。
3. 恢复到新的隔离数据库/卷，绝不覆盖原卷；运行自动一致性检查和关键业务计数对比。
4. 使用一个受控的只读应用实例连接恢复库，验证登录、租户隔离、地块/批次/农事记录/溯源/账单读取。
5. 由事故负责人批准后才切换连接；先只读观察，再按书面计划恢复写入。
6. 监控数据库、队列和对账；记录数据缺口区间，并通知受影响业务方。

应用版本回滚与数据恢复是两件事。应用回滚永不执行反向 migration SQL；schema 不兼容时发布 forward-fix。只有确认主库不可恢复并经过事故审批，才把恢复库提升为生产。
