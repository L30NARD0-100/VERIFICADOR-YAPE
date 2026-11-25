create table app_private.api_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0)
);
alter table app_private.api_rate_limits enable row level security;
revoke all on app_private.api_rate_limits from public, anon, authenticated, service_role;

create index profiles_email_lookup_idx on public.profiles (lower(email)) where email is not null;
