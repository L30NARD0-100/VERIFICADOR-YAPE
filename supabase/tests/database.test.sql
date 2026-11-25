begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'cashier@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'manager@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'admin@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'platform@example.test'),
  ('10000000-0000-0000-0000-000000000005', 'other@example.test');
select is((select count(*) from profiles
  where id between '10000000-0000-0000-0000-000000000001' and '10000000-0000-0000-0000-000000000005'),
  5::bigint, 'La identidad de Auth crea el perfil');
update auth.users set email = 'manager-updated@example.test'
where id = '10000000-0000-0000-0000-000000000002';
select is((select email from profiles where id = '10000000-0000-0000-0000-000000000002'),
  'manager-updated@example.test', 'El perfil sigue el correo de Auth');

insert into companies (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Empresa A'),
  ('20000000-0000-0000-0000-000000000002', 'Empresa B');
insert into branches (id, company_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A1'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'A2'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'B1');
insert into devices (id, company_id, branch_id, name, device_identifier) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'A1', 'device-a1'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002', 'A2', 'device-a2'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000003', 'B1', 'device-b1');
insert into company_members (id, company_id, profile_id, role) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'CASHIER'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', 'MANAGER'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', 'COMPANY_ADMIN'),
  ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000005', 'COMPANY_ADMIN');
insert into member_branches (company_id, member_id, branch_id) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000002');
insert into app_private.platform_admins values ('10000000-0000-0000-0000-000000000004', now());

insert into payments (id, company_id, branch_id, device_id, payment_method_id, amount, currency, received_at)
select id, company_id, branch_id, id, (select id from payment_methods where code = 'yape'),
  10.50, 'PEN', now()
from devices;
insert into payment_events (payment_id, company_id, branch_id, device_id, event_id, event_type, captured_at)
select id, company_id, branch_id, device_id, '60000000-0000-0000-0000-000000000001', 'payment_notice', now()
from payments;
insert into audit_logs (company_id, actor_type, action, entity_type) values
  ('20000000-0000-0000-0000-000000000001', 'system', 'created', 'company'),
  ('20000000-0000-0000-0000-000000000002', 'system', 'created', 'company'),
  (null, 'system', 'created', 'platform');

select is((select count(*) from payment_events), 3::bigint, 'Otro dispositivo puede usar el mismo event_id');
select is((select status::text from payments limit 1), 'pending_verification', 'Un pago comienza pendiente');
select throws_ok($$insert into payment_events (company_id, branch_id, device_id, event_id, event_type, captured_at)
  select company_id, branch_id, device_id, event_id, event_type, captured_at from payment_events limit 1$$,
  '23505', null, 'El mismo dispositivo no puede duplicar un evento');
select throws_ok($$update devices set branch_id = '30000000-0000-0000-0000-000000000003'
  where id = '40000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'Un dispositivo no puede apuntar a una sucursal ajena');
select throws_ok($$insert into member_branches values ('20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')$$,
  '23503', null, 'Una asignación no puede cruzar empresas');
select throws_ok($$update payment_events set payment_id = '40000000-0000-0000-0000-000000000002'
  where device_id = '40000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'El pago relacionado debe tener el mismo origen');
select throws_ok($$update payments set amount = 10.123$$, '23514', null, 'Importe con más de dos decimales');
select throws_ok($$update payments set amount = -1$$, '23514', null, 'Importe negativo');
select throws_ok($$update payments set status = 'verified'$$,
  '23514', null, 'La verificación exige datos de evidencia');
select throws_ok($$update payment_events set processing_status = 'processed'$$,
  '23514', null, 'Un procesamiento final exige fecha');
select throws_ok($$insert into app_private.device_pairings (device_id, code_hash, expires_at)
  values ('40000000-0000-0000-0000-000000000001', decode(repeat('ab', 32), 'hex'), now())$$,
  '23514', null, 'Una vinculación requiere una caducidad posterior a su emisión');
select has_index('public', 'payments', 'payments_company_received_idx', 'Índice del historial empresarial');
select has_index('public', 'payment_events', 'payment_events_branch_received_idx', 'Índice de eventos por sucursal');
select is(
  (select array_agg(tablename::text collate "default" order by tablename)
   from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['payment_events', 'payments'],
  'Realtime publica únicamente las tablas operativas del proyecto');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate
  from pg_publication where pubname = 'supabase_realtime'),
  'Realtime publica altas y cambios');
select ok((select bool_and(relation.relrowsecurity)
  from pg_class as relation join pg_namespace as ns on ns.oid = relation.relnamespace
  where ns.nspname = 'app_private' and relation.relkind = 'r'),
  'Todas las tablas privadas tienen RLS');

set local role anon;
select throws_ok($$select * from payments$$, '42501', null, 'Anónimo sin acceso a pagos');
select throws_ok($$select * from app_private.payment_event_payloads$$, '42501', null, 'Anónimo sin acceso privado');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq($$select name from companies order by name$$,
  $$values ('Empresa A'::text)$$, 'Cajero ve su empresa');
select results_eq($$select name from branches order by name$$,
  $$values ('A1'::text)$$, 'Cajero ve su sucursal');
select results_eq($$select name from devices order by name$$,
  $$values ('A1'::text)$$, 'Cajero ve el dispositivo asignado');
select results_eq($$select branch_id from payments$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid)$$, 'Cajero solo ve pagos asignados');
select is((select count(*) from payment_events), 1::bigint, 'Cajero solo ve eventos de su sucursal');
select is((select count(*) from member_branches), 1::bigint, 'Cajero solo ve sus asignaciones');
select is((select count(*) from profiles), 1::bigint, 'Cajero solo ve su perfil');
select is((select count(*) from audit_logs), 0::bigint, 'Cajero no ve auditoría administrativa');
select throws_ok($$update payments set sender_name = 'escritura prohibida'$$,
  '42501', null, 'Clientes autenticados no modifican pagos');
select throws_ok($$select * from app_private.device_credentials$$, '42501', null, 'Cajero sin credenciales');
select throws_ok($$select * from app_private.payment_event_payloads$$, '42501', null, 'Cajero sin payload privado');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq($$select name from branches order by name$$,
  $$values ('A2'::text)$$, 'Gerente limitado a su sucursal');
select results_eq($$select branch_id from payment_events$$,
  $$values ('30000000-0000-0000-0000-000000000002'::uuid)$$, 'Gerente ve eventos de su sucursal');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from payments), 2::bigint, 'Administrador ve toda su empresa');
select is((select count(*) from company_members), 3::bigint, 'Administrador ve membresías de su empresa');
select is((select count(*) from audit_logs), 1::bigint, 'Administrador ve solo su auditoría');
select throws_ok($$insert into branches (company_id, name) values
  ('20000000-0000-0000-0000-000000000001', 'escritura prohibida')$$,
  '42501', null, 'Incluso un administrador escribe a través del backend');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from companies), 2::bigint, 'Administrador global ve empresas');
select is((select count(*) from payments), 0::bigint, 'El rol global no concede acceso a pagos');
select is((select count(*) from audit_logs where company_id is null), 1::bigint, 'Acceso a auditoría global');
select is((select count(*) from audit_logs where company_id is not null), 0::bigint,
  'El rol global no concede acceso a auditoría de comercios');
reset role;

update profiles set status = 'inactive'
where id = '10000000-0000-0000-0000-000000000004';
update company_members set status = 'inactive' where id = '50000000-0000-0000-0000-000000000001';
update branches set status = 'inactive' where id = '30000000-0000-0000-0000-000000000002';
update companies set status = 'inactive' where id = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from payments), 0::bigint, 'Una membresía revocada pierde acceso con el mismo JWT');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from payment_events), 0::bigint, 'Una sucursal inactiva pierde acceso operativo');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is((select count(*) from companies), 0::bigint, 'Una empresa inactiva se oculta a sus miembros');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from companies), 0::bigint, 'Un perfil global inactivo pierde sus permisos');
select is((select count(*) from audit_logs), 0::bigint, 'Un perfil inactivo pierde acceso a auditoría global');
reset role;

set local role service_role;
select is((select count(*) from payments), 3::bigint, 'El servicio interno tiene acceso privilegiado');
select throws_ok($$delete from audit_logs$$, '42501', null, 'La auditoría es de solo anexado para el backend');
select throws_ok($$delete from payment_events$$, '42501', null, 'El servicio no puede borrar eventos publicados');
reset role;

select * from finish();
rollback;
