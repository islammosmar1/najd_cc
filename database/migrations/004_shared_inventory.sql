-- Keep historical branches/sales; all current stock lives in one shared pool.
create table public.inventory_pools(
 business_id uuid primary key references public.businesses,
 branch_id uuid not null unique,
 foreign key(branch_id,business_id) references public.branches(id,business_id)
);
alter table public.inventory_pools enable row level security;
revoke all on public.inventory_pools from public,anon,authenticated;
grant select on public.inventory_pools to authenticated;
create policy pool_read on public.inventory_pools for select to authenticated using(private.member(business_id));
lock table public.branch_inventory in exclusive mode;
create table private.inventory_merge_backup as
 select i.*,now() as captured_at from public.branch_inventory i
 join private.company_setup c using(business_id);
revoke all on private.inventory_merge_backup from public,anon,authenticated;

do $$ declare b uuid;pool uuid;actor uuid;begin
 for b in select business_id from private.company_setup loop
  insert into public.branches(business_id,name) values(b,'المخزون الإجمالي') returning id into pool;
  insert into public.inventory_pools values(b,pool);
  select user_id into actor from public.memberships where business_id=b and role='owner' limit 1;
  if actor is null then select user_id into actor from public.inventory_movements where business_id=b limit 1;end if;
  if actor is null and exists(select 1 from public.branch_inventory where business_id=b and quantity>0) then
   raise exception 'تعذر تحديد مسؤول سجل توحيد المخزون';
  end if;
  insert into public.inventory_movements(business_id,branch_id,variant_id,delta,reason,user_id)
   select b,i.branch_id,i.variant_id,-i.quantity,'نقل إلى المخزون الإجمالي',actor
   from public.branch_inventory i where i.business_id=b and i.quantity>0;
  insert into public.branch_inventory(business_id,branch_id,variant_id,quantity)
   select b,pool,i.variant_id,sum(i.quantity)::integer from public.branch_inventory i
   where i.business_id=b group by i.variant_id;
  insert into public.inventory_movements(business_id,branch_id,variant_id,delta,reason,user_id)
   select b,pool,i.variant_id,i.quantity,'تجميع كميات المخزون دون تغيير الإجمالي',actor
   from public.branch_inventory i where i.branch_id=pool and i.quantity>0;
  update public.branch_inventory set quantity=0 where business_id=b and branch_id<>pool;
 end loop;
end $$;

-- Old receipts still reference their original branch. Returning those items
-- replenishes the shared pool, while authorization uses the original receipt.
create or replace function private.move(b uuid,br uuid,v uuid,d integer,why text,ref uuid)
returns void language plpgsql set search_path='' as $$ begin
 if d=0 then return;end if;
 br:=coalesce((select branch_id from public.inventory_pools where business_id=b),br);
 insert into public.branch_inventory(business_id,branch_id,variant_id,quantity) values(b,br,v,0) on conflict do nothing;
 update public.branch_inventory set quantity=quantity+d where branch_id=br and variant_id=v and quantity+d>=0;
 if not found then raise exception 'الكمية المتوفرة غير كافية';end if;
 insert into public.inventory_movements(business_id,branch_id,variant_id,delta,reason,reference_id,user_id)
 values(b,br,v,d,why,ref,auth.uid());
end $$;

-- Compare and set must compare the shared count, including older open clients.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('private.set_stock(jsonb)'::regprocedure);
 definition:=replace(definition,'begin'||chr(10)||' if not private.allowed',
  'begin'||chr(10)||' br:=coalesce((select branch_id from public.inventory_pools where business_id=b),br);'||chr(10)||' if not private.allowed');
 if position('br:=coalesce' in definition)=0 then raise exception 'stock function migration mismatch';end if;
 execute definition;
end $$;
