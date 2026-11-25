create schema app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;

create type public.record_status as enum ('active', 'inactive');
create type public.company_role as enum ('COMPANY_ADMIN', 'MANAGER', 'CASHIER');
create type public.device_status as enum ('pending', 'active', 'revoked');
create type public.payment_status as enum ('pending_verification', 'verified');
create type public.event_status as enum (
  'received', 'processed', 'needs_review', 'rejected', 'processing_error'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  legal_name text,
  tax_id text unique check (tax_id ~ '^[0-9]{11}$'),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 160),
  email text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.company_role not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (company_id, profile_id),
  unique (company_id, id)
);
create index company_members_profile_idx on public.company_members (profile_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null check (btrim(name) <> ''),
  address text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.member_branches (
  company_id uuid not null,
  member_id uuid not null,
  branch_id uuid not null,
  primary key (company_id, member_id, branch_id),
  foreign key (company_id, member_id) references public.company_members (company_id, id)
    on delete cascade,
  foreign key (company_id, branch_id) references public.branches (company_id, id)
);
create index member_branches_branch_idx on public.member_branches (company_id, branch_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  branch_id uuid not null,
  name text not null check (btrim(name) <> ''),
  device_identifier text not null check (btrim(device_identifier) <> ''),
  platform text not null default 'android' check (platform = 'android'),
  app_version text,
  status public.device_status not null default 'pending',
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, device_identifier),
  foreign key (company_id, branch_id) references public.branches (company_id, id),
  check (status <> 'active' or paired_at is not null)
);
create index devices_branch_idx on public.devices (company_id, branch_id);

create table app_private.device_credentials (
  device_id uuid primary key references public.devices (id) on delete cascade,
  device_token_hash bytea not null unique check (octet_length(device_token_hash) = 32),
  created_at timestamptz not null default now()
);

create table app_private.device_pairings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (consumed_at is null or (consumed_at >= created_at and consumed_at < expires_at)),
  check (revoked_at is null or (revoked_at >= created_at and consumed_at is null))
);
create index device_pairings_device_idx on app_private.device_pairings (device_id);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  status public.record_status not null default 'active'
);

-- Catálogo requerido también en entornos sin seed de desarrollo.
insert into public.payment_methods (name, code) values ('Yape', 'yape');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  payment_method_id uuid not null references public.payment_methods (id),
  sender_name text,
  amount numeric check (
    amount > 0 and amount < 1000000000000 and scale(amount) <= 2
  ),
  currency text check (currency ~ '^[A-Z]{3}$'),
  received_at timestamptz not null,
  status public.payment_status not null default 'pending_verification',
  verification_source text,
  verification_reference text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, branch_id, device_id, id),
  foreign key (company_id, branch_id) references public.branches (company_id, id),
  foreign key (company_id, device_id) references public.devices (company_id, id),
  check (
    (status = 'pending_verification' and verification_source is null
      and verification_reference is null and verified_at is null)
    or
    (status = 'verified' and nullif(btrim(verification_source), '') is not null
      and nullif(btrim(verification_reference), '') is not null and verified_at is not null)
  )
);
create index payments_company_received_idx on public.payments (company_id, received_at desc, id desc);
create index payments_branch_received_idx on public.payments (company_id, branch_id, received_at desc, id desc);
create index payments_device_received_idx on public.payments (company_id, device_id, received_at desc, id desc);
create index payments_method_idx on public.payments (payment_method_id);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid,
  company_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  event_id uuid not null,
  event_type text not null check (btrim(event_type) <> ''),
  source_notification_id text,
  processing_status public.event_status not null default 'received',
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (device_id, event_id),
  foreign key (company_id, branch_id) references public.branches (company_id, id),
  foreign key (company_id, device_id) references public.devices (company_id, id),
  foreign key (company_id, branch_id, device_id, payment_id)
    references public.payments (company_id, branch_id, device_id, id),
  check ((processing_status = 'received') = (processed_at is null)),
  check (processed_at is null or processed_at >= received_at)
);
create index payment_events_company_received_idx on public.payment_events (company_id, received_at desc, id desc);
create index payment_events_branch_received_idx on public.payment_events (company_id, branch_id, received_at desc, id desc);
create index payment_events_device_received_idx on public.payment_events (company_id, device_id, received_at desc, id desc);
create index payment_events_payment_idx on public.payment_events (company_id, branch_id, device_id, payment_id)
  where payment_id is not null;

create table app_private.payment_event_payloads (
  payment_event_id uuid primary key references public.payment_events (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id),
  user_id uuid references public.profiles (id) on delete set null,
  device_id uuid,
  actor_type text not null check (actor_type in ('user', 'device', 'system')),
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (company_id, device_id) references public.devices (company_id, id),
  check ((actor_type = 'device') = (device_id is not null)),
  check (device_id is null or company_id is not null),
  check (actor_type = 'user' or user_id is null)
);
create index audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc, id desc);
create index audit_logs_user_idx on public.audit_logs (user_id) where user_id is not null;
create index audit_logs_device_idx on public.audit_logs (company_id, device_id) where device_id is not null;

create function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger companies_updated_at before update on public.companies
for each row execute function app_private.touch_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function app_private.touch_updated_at();
create trigger devices_updated_at before update on public.devices
for each row execute function app_private.touch_updated_at();

create function app_private.sync_auth_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger sync_auth_profile
after insert or update of email on auth.users
for each row execute function app_private.sync_auth_profile();

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
