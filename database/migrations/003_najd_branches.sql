create table private.company_setup(singleton boolean primary key default true check(singleton),business_id uuid not null unique references public.businesses);
alter table private.company_setup enable row level security;
revoke all on private.company_setup from public,anon,authenticated;
do $$ declare b uuid;begin
 insert into public.businesses(name) values('najd') returning id into b;
 insert into public.branches(business_id,name,address) values(b,'فرع الستي سنتر',''),(b,'فرع شارع أبو بكر','');
 insert into private.company_setup(singleton,business_id) values(true,b);
end $$;
