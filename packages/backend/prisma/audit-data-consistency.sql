-- Deployment preflight audit for historical data created before stricter owner checks.
-- Expected result for a clean database: zero rows.

select
  'field_owner_tenant_mismatch' as issue_type,
  f.id as record_id,
  'field tenant differs from owner tenant' as detail
from fields f
join users u on u.id = f.owner_id
where f.tenant_id <> u.tenant_id

union all

select
  'supply_owner_tenant_mismatch' as issue_type,
  s.id as record_id,
  'supply tenant differs from owner tenant' as detail
from supplies s
join users u on u.id = s.owner_id
where s.tenant_id <> u.tenant_id

union all

select
  'batch_field_owner_mismatch' as issue_type,
  b.id as record_id,
  'batch.owner/tenant differs from field.owner/tenant' as detail
from batches b
join fields f on f.id = b.field_id
where b.tenant_id <> f.tenant_id
   or b.owner_id <> f.owner_id

union all

select
  'supply_issue_owner_mismatch' as issue_type,
  si.id as record_id,
  'supply issue owner/tenant differs from supply or batch' as detail
from supply_issues si
join supplies s on s.id = si.supply_id
join batches b on b.id = si.batch_id
where si.tenant_id <> s.tenant_id
   or si.tenant_id <> b.tenant_id
   or si.owner_id <> s.owner_id
   or si.owner_id <> b.owner_id

union all

select
  'farm_record_batch_field_mismatch' as issue_type,
  fr.id as record_id,
  'farm record tenant/field differs from batch or field owner' as detail
from farm_records fr
join batches b on b.id = fr.batch_id
join fields f on f.id = fr.field_id
where fr.tenant_id <> b.tenant_id
   or fr.field_id <> b.field_id
   or f.tenant_id <> b.tenant_id
   or f.owner_id <> b.owner_id

union all

select
  'trace_code_batch_tenant_mismatch' as issue_type,
  tc.id as record_id,
  'trace code tenant differs from batch tenant' as detail
from trace_codes tc
left join batches b on b.id = tc.batch_id
where b.id is null or tc.tenant_id <> b.tenant_id

union all

select
  'trace_event_batch_tenant_mismatch' as issue_type,
  te.id as record_id,
  'trace event tenant differs from batch tenant' as detail
from trace_events te
left join batches b on b.id = te.batch_id
where b.id is null or te.tenant_id <> b.tenant_id

union all

select
  'trace_scan_batch_tenant_mismatch' as issue_type,
  ts.id as record_id,
  'trace scan tenant differs from batch tenant' as detail
from trace_scans ts
left join batches b on b.id = ts.batch_id
where b.id is null or ts.tenant_id <> b.tenant_id

union all

select
  'trace_credential_batch_tenant_mismatch' as issue_type,
  tc.id as record_id,
  'trace credential tenant differs from batch tenant' as detail
from trace_credentials tc
left join batches b on b.id = tc.batch_id
where b.id is null or tc.tenant_id <> b.tenant_id

union all

select
  'credit_reservation_account_tenant_mismatch' as issue_type,
  cr.id as record_id,
  'credit reservation tenant differs from account tenant' as detail
from credit_reservations cr
join credit_accounts ca on ca.id = cr.account_id
where cr.tenant_id <> ca.tenant_id

union all

select
  'duplicate_wechat_app_id' as issue_type,
  app_id as record_id,
  'wechat app_id appears more than once' as detail
from integration_configs
where provider = 'wechat' and app_id is not null
group by app_id
having count(*) > 1

union all

select
  'farm_record_supply_owner_mismatch' as issue_type,
  fr.id as record_id,
  'farm record supply owner/tenant differs from batch' as detail
from farm_records fr
join batches b on b.id = fr.batch_id
left join supplies s on s.id = fr.supply_id
where fr.supply_id is not null
  and (
    s.id is null
    or s.tenant_id <> b.tenant_id
    or s.owner_id <> b.owner_id
  );
