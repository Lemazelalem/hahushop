-- Public landing facts for Hahu Business.
-- Exposes a sanitized, aggregated view of organization/application data so the
-- marketing page can show real adoption and credit metrics without exposing
-- sensitive applicant details.

do $$
begin
  if to_regclass('public.business_applications') is null then
    execute $fn$
      create or replace function public.get_business_landing_facts()
      returns jsonb
      language sql
      stable
      security definer
      set search_path = public
      as $sql$
        select jsonb_build_object(
          'activeOrganizationsCount', 0,
          'approvedCreditCents', 0,
          'officeDeliveryCount', 0,
          'avgApprovalHours', null,
          'activeOrganizations', '[]'::jsonb,
          'creditOrganizations', '[]'::jsonb,
          'deliveryOrganizations', '[]'::jsonb,
          'approvalOrganizations', '[]'::jsonb
        );
      $sql$;
    $fn$;

    raise notice 'public.business_applications does not exist, created empty get_business_landing_facts() fallback';
    return;
  end if;

  execute $fn$
    create or replace function public.get_business_landing_facts()
    returns jsonb
    language sql
    stable
    security definer
    set search_path = public
    as $sql$
      with source_rows as (
        select
          nullif(trim(org_name), '') as org_name,
          nullif(trim(org_type), '') as org_type,
          status,
          nullif(trim(office_address), '') as office_address,
          coalesce(payment_terms, preferred_payment_terms) as payment_terms,
          approved_credit_limit_cents,
          created_at,
          reviewed_at,
          case
            when reviewed_at is not null and reviewed_at >= created_at then
              round(extract(epoch from (reviewed_at - created_at)) / 3600.0, 1)
            else null
          end as approval_hours
        from public.business_applications
        where status in ('approved', 'pending')
          and nullif(trim(org_name), '') is not null
      ),
      active_orgs as (
        select distinct on (lower(org_name))
          org_name,
          org_type,
          status,
          office_address,
          payment_terms,
          approved_credit_limit_cents,
          created_at,
          reviewed_at,
          approval_hours
        from source_rows
        order by
          lower(org_name),
          case when status = 'approved' then 0 else 1 end,
          coalesce(reviewed_at, created_at) desc
      ),
      approved_orgs as (
        select *
        from active_orgs
        where status = 'approved'
      ),
      approval_metrics as (
        select
          round(avg(extract(epoch from (reviewed_at - created_at)) / 3600.0))::int as avg_hours
        from public.business_applications
        where status = 'approved'
          and reviewed_at is not null
          and reviewed_at >= created_at
      )
      select jsonb_build_object(
        'activeOrganizationsCount',
        (select count(*) from active_orgs),
        'approvedCreditCents',
        coalesce((select sum(coalesce(approved_credit_limit_cents, 0)) from approved_orgs), 0),
        'officeDeliveryCount',
        (select count(*) from active_orgs where office_address is not null),
        'avgApprovalHours',
        (select avg_hours from approval_metrics),
        'activeOrganizations',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'orgName', org_name,
              'orgType', org_type,
              'status', status,
              'paymentTerms', payment_terms,
              'approvedCreditLimitCents', approved_credit_limit_cents,
              'approvalHours', approval_hours,
              'createdAt', created_at,
              'reviewedAt', reviewed_at
            )
            order by case when status = 'approved' then 0 else 1 end, org_name
          )
          from (
            select *
            from active_orgs
            order by case when status = 'approved' then 0 else 1 end, org_name
            limit 18
          ) ranked_active_orgs
        ), '[]'::jsonb),
        'creditOrganizations',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'orgName', org_name,
              'orgType', org_type,
              'status', status,
              'paymentTerms', payment_terms,
              'approvedCreditLimitCents', approved_credit_limit_cents,
              'approvalHours', approval_hours,
              'createdAt', created_at,
              'reviewedAt', reviewed_at
            )
            order by coalesce(approved_credit_limit_cents, 0) desc, org_name
          )
          from (
            select *
            from approved_orgs
            order by coalesce(approved_credit_limit_cents, 0) desc, org_name
            limit 18
          ) ranked_credit_orgs
        ), '[]'::jsonb),
        'deliveryOrganizations',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'orgName', org_name,
              'orgType', org_type,
              'status', status,
              'paymentTerms', payment_terms,
              'approvedCreditLimitCents', approved_credit_limit_cents,
              'approvalHours', approval_hours,
              'createdAt', created_at,
              'reviewedAt', reviewed_at
            )
            order by case when status = 'approved' then 0 else 1 end, org_name
          )
          from (
            select *
            from active_orgs
            where office_address is not null
            order by case when status = 'approved' then 0 else 1 end, org_name
            limit 18
          ) ranked_delivery_orgs
        ), '[]'::jsonb),
        'approvalOrganizations',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'orgName', org_name,
              'orgType', org_type,
              'status', status,
              'paymentTerms', payment_terms,
              'approvedCreditLimitCents', approved_credit_limit_cents,
              'approvalHours', approval_hours,
              'createdAt', created_at,
              'reviewedAt', reviewed_at
            )
            order by approval_hours asc nulls last, reviewed_at desc nulls last, org_name
          )
          from (
            select *
            from approved_orgs
            where approval_hours is not null
            order by approval_hours asc nulls last, reviewed_at desc nulls last, org_name
            limit 18
          ) ranked_approval_orgs
        ), '[]'::jsonb)
      );
    $sql$;
  $fn$;
end
$$;

revoke all on function public.get_business_landing_facts() from public;
grant execute on function public.get_business_landing_facts() to anon, authenticated;

comment on function public.get_business_landing_facts() is
  'Sanitized public Hahu Business landing data: organization counts, approved credit totals, delivery reach, approval speed, and organization display lists.';
