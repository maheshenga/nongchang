# PostgreSQL disaster recovery

## Objectives and ownership

- Recovery point objective (RPO): 24 hours. Run at least one encrypted backup every 24 hours.
- Recovery time objective (RTO): 4 hours from incident declaration to verified read-only service.
- Primary owner: platform on-call. Escalate to the engineering lead after 30 minutes without a viable restore target, and to the business incident lead when the RTO is at risk.
- Retain quarterly restore-drill evidence for at least 12 months: command timestamp, Git SHA, manifest, checksum, row-count audit, duration, and incident follow-ups. Never retain the encryption key with the evidence.

## Backup

Set `DATABASE_URL` and a runtime-only 32-byte `BACKUP_ENCRYPTION_KEY` (64 hex characters or base64). The output directory must be absolute and outside the repository:

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<runtime secret from the secret manager>'
corepack pnpm@10.33.2 backup:postgres -- --output-dir 'D:\nongchang-backups' --retention 14
```

Each backup set contains an AES-256-GCM encrypted custom-format dump, a versioned manifest, and a SHA-256 sidecar. The manifest intentionally excludes connection strings and credentials. Copy all three files to immutable/off-site storage and alert if the newest verified set is older than 25 hours.

When PostgreSQL client tools are not installed on the host, set `BACKUP_POSTGRES_CONTAINER` to the approved database container. Production hosts should normally set `PG_BIN_DIR` to the pinned PostgreSQL client installation.

## Restore drill

The verification command creates a disposable `nongchang_restore_<timestamp>` database, verifies the checksum and GCM authentication tag, restores the dump, checks tenant/user/batch consistency, and drops the database in `finally`:

```powershell
corepack pnpm@10.33.2 backup:verify-restore -- --output-dir "$env:TEMP\nongchang-backup-drill"
```

For a real incident, first restore into an isolated database, run the same consistency checks, compare critical counts with the manifest evidence, and only then direct read-only application traffic to the restored target. Database rollback is never performed by reversing migration SQL during an application rollback.

## Quarterly drill checklist

1. Fetch a backup and its key through independent approved access paths.
2. Verify SHA-256 before decryption.
3. Restore into an isolated database and run the automated tenant-consistency audit.
4. Record elapsed time against the 4-hour RTO and backup age against the 24-hour RPO.
5. Delete the disposable database and plaintext dump; retain only encrypted artifacts and evidence.
6. File follow-up work for any manual step, missing alert, excessive duration, or undocumented credential dependency.
