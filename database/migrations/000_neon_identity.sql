-- Neon PostgreSQL: login credentials never leave the Next.js server.
-- Neon Auth remains the identity authority. This table maps its opaque user
-- IDs to UUIDs used by the portable retail schema.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 execute format('grant authenticated to %I',current_user);
end $$;
create schema if not exists auth;
revoke all on schema auth from public;
create table auth.users(id uuid primary key default gen_random_uuid(),email text not null,provider_id text unique);
create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to authenticated;
revoke all on auth.users from public,anon,authenticated;
