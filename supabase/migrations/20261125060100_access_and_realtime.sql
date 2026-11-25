-- Predicados privados. SECURITY DEFINER evita recursión de RLS sobre membresías.
create function app_private.has_company_access(
  target_company uuid, required_role public.company_role default null
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members as member
    join public.companies as company on company.id = member.company_id
    join public.profiles as profile on profile.id = member.profile_id
    where member.profile_id = (select auth.uid())
      and member.company_id = target_company
      and member.status = 'active'
      and company.status = 'active'
      and profile.status = 'active'
      and (required_role is null or member.role = required_role)
  );
$$;

create function app_private.has_branch_access(target_company uuid, target_branch uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app_private.has_company_access(target_company, 'COMPANY_ADMIN')
    or (
      app_private.has_company_access(target_company)
      and exists (
        select 1
        from public.company_members as member
        join public.member_branches as assignment
          on assignment.company_id = member.company_id and assignment.member_id = member.id
        join public.branches as branch
          on branch.company_id = assignment.company_id and branch.id = assignment.branch_id
        where member.company_id = target_company
          and member.profile_id = (select auth.uid())
          and branch.id = target_branch
          and branch.status = 'active'
      )
    );
$$;

create function app_private.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.platform_admins as admin
    join public.profiles as profile on profile.id = admin.profile_id
    where admin.profile_id = (select auth.uid()) and profile.status = 'active'
  );
$$;

revoke all on all functions in schema app_private from public, anon, authenticated, service_role;
grant execute on function app_private.has_company_access(uuid, public.company_role),
  app_private.has_branch_access(uuid, uuid), app_private.is_platform_admin() to authenticated;

alter table app_private.platform_admins enable row level security;
alter table app_private.device_credentials enable row level security;
alter table app_private.device_pairings enable row level security;
alter table app_private.payment_event_payloads enable row level security;
revoke all on all tables in schema app_private from public, anon, authenticated, service_role;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;
alter table public.branches enable row level security;
alter table public.member_branches enable row level security;
alter table public.devices enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.companies, public.profiles, public.company_members, public.branches,
  public.member_branches, public.devices, public.payment_methods, public.payments,
  public.payment_events, public.audit_logs from public, anon, authenticated, service_role;

grant select on public.companies, public.profiles, public.company_members, public.branches,
  public.member_branches, public.devices, public.payment_methods, public.payments,
  public.payment_events, public.audit_logs to authenticated;

grant select, insert, update on public.companies, public.profiles, public.company_members,
  public.branches, public.devices, public.payment_methods, public.payments,
  public.payment_events to service_role;
grant select, insert, delete on public.member_branches to service_role;
grant select, insert on public.audit_logs to service_role;

create policy companies_read on public.companies for select to authenticated
using ((select app_private.is_platform_admin()) or app_private.has_company_access(id));

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy company_members_read on public.company_members for select to authenticated
using (
  app_private.has_company_access(company_id, 'COMPANY_ADMIN')
  or (profile_id = (select auth.uid()) and app_private.has_company_access(company_id))
);

create policy branches_read on public.branches for select to authenticated
using (app_private.has_branch_access(company_id, id));

create policy member_branches_read on public.member_branches for select to authenticated
using (
  app_private.has_company_access(company_id, 'COMPANY_ADMIN')
  or (
    app_private.has_branch_access(company_id, branch_id)
    and exists (
      select 1 from public.company_members as member
      where member.company_id = member_branches.company_id
        and member.id = member_branches.member_id and member.profile_id = (select auth.uid())
    )
  )
);

create policy devices_read on public.devices for select to authenticated
using (app_private.has_branch_access(company_id, branch_id));

create policy payment_methods_read on public.payment_methods for select to authenticated
using (status = 'active');

create policy payments_read on public.payments for select to authenticated
using (app_private.has_branch_access(company_id, branch_id));

create policy payment_events_read on public.payment_events for select to authenticated
using (app_private.has_branch_access(company_id, branch_id));

create policy audit_logs_read on public.audit_logs for select to authenticated
using (
  app_private.has_company_access(company_id, 'COMPANY_ADMIN')
  or (company_id is null and (select app_private.is_platform_admin()))
);

-- La publicación del proyecto solo emite altas y cambios. Los borrados no se
-- usan para el historial y Realtime no puede aplicar RLS al contenido borrado.
alter publication supabase_realtime set (publish = 'insert, update');
alter publication supabase_realtime add table public.payments, public.payment_events;
