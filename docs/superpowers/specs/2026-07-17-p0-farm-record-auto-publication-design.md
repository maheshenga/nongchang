# P0 Farm Record Auto-Publication Design

**Status:** Approved on 2026-07-17

## Context

The production workflow currently writes field work to `FarmRecord`, while consumer trace pages read only `TraceEvent`. Web and miniapp users can therefore save real work, photos, and locations without those records ever appearing in the public trace timeline. The miniapp copy currently promises that uploaded evidence enters the trace chain, so this is both a functional and a truthfulness defect.

The user selected automatic publication: a completed farm record must enter the public trace timeline without a second approval action.

## Goal

Guarantee that every newly completed farm record creates exactly one public farm trace event in the same database transaction, while exposing only an explicit public-field allowlist.

## Non-goals

- Do not introduce Redis, Kafka, a background worker, or an external queue.
- Do not automatically publish historical completed farm records during migration.
- Do not expose internal costs, labor values, supply usage, user IDs, tenant IDs, or exact operation GPS coordinates.
- Do not replace non-farm trace events such as origin, harvest, warehouse, logistics, or retail.
- Do not implement the later correction workflow, field polygon lifecycle, QR export, or scan-audit fixes in this subproject.

## Chosen Architecture

Use a synchronous, transactionally coupled public projection:

1. `FarmRecord` remains the operational source record.
2. `TraceEvent` remains the consumer-facing timeline projection.
3. `TraceEvent.sourceFarmRecordId` links the projection to its source and is unique.
4. Creating a record with `status = completed` creates both rows in one transaction.
5. Creating a pending record creates only the `FarmRecord`.
6. Transitioning a pending record to completed creates its `TraceEvent` in the same transaction.
7. Repeating completion must return the already-completed record without creating a second event.
8. A completed record cannot return to pending.

This approach preserves the current public trace contract and existing `TraceEvent` consumers, gives the public timeline an immutable publication snapshot, and avoids a new queue dependency.

## Schema Changes

Add an optional one-to-one source link:

```prisma
model FarmRecord {
  // existing fields
  traceEvent TraceEvent?
}

model TraceEvent {
  // existing fields
  sourceFarmRecordId String?      @unique @map("source_farm_record_id")
  sourceFarmRecord   FarmRecord?  @relation(fields: [sourceFarmRecordId], references: [id], onDelete: Restrict)
}
```

The migration adds the nullable column, unique index, and foreign key. Existing events and records remain unchanged. Historical rows are not backfilled automatically.

## Public Projection Contract

A dedicated pure mapper builds the `TraceEvent` create input from trusted database rows rather than accepting public fields from the client.

| Public field | Source | Rule |
|---|---|---|
| `type` | constant | Always `farm` |
| `title` | `FarmRecord.action` | Trimmed operational action |
| `actor` | batch owner display name | Never expose the individual operator identity |
| `location` | field name | Never expose exact operation GPS |
| `occurredAt` | `FarmRecord.recordedAt` | Preserve the recorded work time |
| `payload.desc` | `detail.note` or `detail.desc` | First non-empty string, trimmed to 2,000 Unicode code points |
| `payload.image` | first valid record image | Publish at most one image in the current public contract |
| `sourceFarmRecordId` | farm record ID | Internal linkage only; public DTO does not expose it |

Explicitly excluded from the public payload:

- `detail.cost`
- `detail.labor`
- `detail.material`
- `supplyId` and `supplyAmount`
- `operatorId`, `tenantId`, `batchId`, and `fieldId`
- `FarmRecord.location` exact coordinates
- unknown keys from `detail`

## Service Flow

### Completed record creation

1. Validate tenant and owner scope for batch, field, and optional supply.
2. Verify that the field belongs to the selected batch.
3. Load the batch owner's display name and field name from scoped database rows.
4. Start or reuse the existing quota transaction.
5. Create the `FarmRecord`.
6. Create the linked `TraceEvent` using the public mapper.
7. Commit both rows together.
8. Return the serialized farm record.

If projection creation fails, the farm-record write and supply consumption roll back together.

### Pending record creation

Create only the `FarmRecord`. No public event exists while the task is pending.

### Completion transition

1. Use a tenant-scoped read only to obtain the record's candidate `batchId`.
2. In the transaction, lock and verify the candidate batch row first, then lock and verify the farm-record row.
3. Reload the record with its batch, batch owner, and field metadata through the transaction client.
4. Re-run batch and field scope checks through the transaction client and fail closed unless the record tenant, locked batch, batch tenant, batch field, field tenant, field owner, batch owner, and batch-owner tenant relationships all agree with the authenticated user.
5. If it is pending and the requested state is completed, update the record and create the linked event in the same transaction.
6. If it is already completed and the request repeats completed, return it as an idempotent no-op after the same lock and invariant checks.
7. If a client requests completed to pending, reject it with `BadRequestException` and leave both rows unchanged.

## API and UI Impact

- Existing `POST /api/farm-records` and `PATCH /api/farm-records/:id/status` request shapes remain compatible.
- Existing public and authenticated trace-event readers receive the new event without endpoint changes.
- The miniapp submission copy remains valid after this change.
- Web completion feedback changes from the inaccurate `已标记完成并归档` to `已完成并发布到公开溯源`.
- No additional publish button is introduced because publication is automatic.

## Error Handling

- Scope and ownership failures remain fail-closed.
- Duplicate projection attempts are prevented by the unique source-record link.
- A projection failure never leaves a completed record without a public event.
- A farm-record failure never leaves an orphan trace event.
- Migration failure leaves the existing nullable schema untouched through normal transactional migration behavior.

## Historical Records

Existing completed records remain unpublished unless they already have manually created trace events. A later operator command will:

1. report eligible records and the exact public fields that would be emitted;
2. require an explicit execution flag;
3. create missing projections idempotently by `sourceFarmRecordId`;
4. emit a summary of created, skipped, and failed records.

That command is intentionally outside this P0 subproject so deployment cannot unexpectedly disclose historical data.

## Test Strategy

Follow red-green-refactor for every behavior.

### Pure mapper tests

- Maps action, owner, field, time, description, and first image.
- Supports both miniapp `detail.note` and Web `detail.desc`.
- Excludes cost, labor, material, supply, IDs, GPS, and unknown detail keys.
- Produces null payload when no public description or image exists.

### Service unit tests

- Completed create writes one record and one linked event in one transaction.
- Pending create writes no event.
- Supply-quota completed create writes the event inside the quota transaction.
- Pending to completed writes one event.
- Repeated completed transition writes no duplicate event.
- Completed to pending is rejected.
- Trace-event failure rejects the request and does not return a successful record.
- Tenant, batch, field, owner, and supply scope protections remain intact.

### Database-backed E2E

- Create a completed miniapp-style record, then public trace returns its farm event.
- Create a pending Web-style task: public trace does not return it until completion.
- Complete the task twice: exactly one event exists.
- Public response contains none of the excluded internal or commercial fields.
- Existing completed fixture records are not implicitly backfilled by migration.
- An inconsistent pending record permitted by independent relations is rejected without a status change or linked event.
- Concurrent pending completion and force deletion of an unscanned batch cannot deadlock and leaves only a transactionally consistent outcome.

### Frontend tests

- Web completion feedback states that the record is publicly published.
- Existing consumer timeline renders the projected description and image.
- Existing miniapp trace timeline receives the event through the current endpoint.

## Binding Production Cutover and Rollback Boundary

The production cutover and rollback boundary is identical across the approved design and deployment runbooks:

1. Before production, restore a current backup into a rehearsal database; record the `trace_events` row count and total relation size, migration duration, and observed lock behavior. Do not proceed without an operator-approved maintenance-window result.
2. At cutover, enable maintenance mode and write quiescence, stop every PM2 backend instance before `prisma:deploy`, and verify no old backend process listens on port `3001`; old and new versions must never serve writes concurrently.
3. While writes remain stopped, take and verify the pre-cutover database backup, deploy the migration, and start only the new build.
4. Pre-open smoke writes are allowed only as uniquely tagged, release-owned disposable fixtures; record the release ID and every created ID. Keep maintenance mode and write quiescence active while readiness and focused smoke checks run.
5. If any pre-open check fails, keep writes stopped and restore the pre-cutover backup; that restore removes the disposable smoke writes, and rollback to the old build is allowed only together with that backup restore.
6. If checks pass, remove every disposable smoke fixture in FK-safe order and verify zero residue before reopening user traffic.
7. The irreversible boundary is the first non-disposable user write accepted after maintenance mode is removed, not the controlled smoke write.
8. After that boundary, old-build/database rollback is forbidden; re-enter maintenance mode if necessary and forward-fix. Historical pending records have no completion timestamp that can safely distinguish missed mixed-version publication from intentional historical non-backfill.

No broad historical reconciler or automatic backfill is part of this cutover.

## Acceptance Criteria

The subproject is complete only when all of the following are true:

1. A newly completed miniapp farm record appears on the consumer page for a code belonging to the same batch.
2. A pending Web task remains private until completion.
3. Completion and publication are atomic and idempotent.
4. Completed records cannot be reopened as pending.
5. Public output exposes only the documented allowlist.
6. Historical completed records are not automatically published.
7. Targeted unit tests, full backend/web/miniapp unit suites, shared/backend/web builds, miniapp production build, and database E2E all pass.

## Rollback

Rollback to the old application and pre-cutover database is allowed only while writes are still stopped and before production traffic has been reopened. Once the new build accepts any production write, rollback to a pre-feature backend or removal of the source relation is unsafe; keep or re-enter maintenance mode and forward-fix instead.
