-- Source schema. The generated migration is the deployable copy.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create type public.staff_role as enum ('super_admin','owner','manager','cashier','inventory','accountant');
create table public.businesses(id uuid primary key default gen_random_uuid(),name text not null,currency text not null default 'ILS' check(currency='ILS'),tax_bps integer not null default 0 check(tax_bps between 0 and 10000));
create table public.branches(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,name text not null,address text not null default '',unique(id,business_id));
create table public.memberships(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,user_id uuid not null references auth.users,branch_id uuid,role public.staff_role not null,display_name text not null,foreign key(branch_id,business_id) references public.branches(id,business_id),unique nulls not distinct(business_id,user_id,branch_id));
create index memberships_user_idx on public.memberships(user_id,business_id);
create function private.allowed(b uuid,br uuid,roles public.staff_role[]) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.business_id=b and (m.branch_id is null or m.branch_id=br) and m.role=any(roles)); $$;
create function private.member(b uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.business_id=b); $$;
create table public.categories(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,name text not null,unique(business_id,name));
create table public.suppliers(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,name text not null,phone text not null default '');
create table public.products(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,name text not null,description text not null default '',image_url text not null default '',category text not null default '',active boolean not null default true,unique(id,business_id));
create table public.product_variants(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,product_id uuid not null,name text not null default '',sku text not null,price bigint not null check(price>=0),min_stock integer not null default 5 check(min_stock>=0),foreign key(product_id,business_id) references public.products(id,business_id),unique(business_id,sku),unique(id,business_id));
create table public.product_barcodes(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,variant_id uuid not null,barcode text not null,foreign key(variant_id,business_id) references public.product_variants(id,business_id),unique(business_id,barcode));
create table private.costs(variant_id uuid primary key references public.product_variants,cost bigint not null check(cost>=0));
create table public.branch_prices(branch_id uuid not null,variant_id uuid not null,business_id uuid not null,price bigint not null check(price>=0),primary key(branch_id,variant_id),foreign key(branch_id,business_id) references public.branches(id,business_id),foreign key(variant_id,business_id) references public.product_variants(id,business_id));
create table public.branch_inventory(branch_id uuid not null,variant_id uuid not null,business_id uuid not null,quantity integer not null default 0 check(quantity>=0),primary key(branch_id,variant_id),foreign key(branch_id,business_id) references public.branches(id,business_id),foreign key(variant_id,business_id) references public.product_variants(id,business_id));
create table public.cash_registers(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,name text not null,foreign key(branch_id,business_id) references public.branches(id,business_id));
create table public.cash_shifts(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,user_id uuid not null references auth.users,opening bigint not null check(opening>=0),closing bigint check(closing>=0),expected bigint,opened_at timestamptz not null default now(),closed_at timestamptz,foreign key(branch_id,business_id) references public.branches(id,business_id));
create unique index one_open_shift on public.cash_shifts(branch_id,user_id) where closed_at is null;
create table public.sales(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,user_id uuid not null references auth.users,shift_id uuid not null references public.cash_shifts,idempotency_key uuid not null,request jsonb not null,total bigint not null check(total>=0),discount bigint not null check(discount>=0),tax bigint not null check(tax>=0),status text not null default 'completed' check(status in ('completed','returned','cancelled')),created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.branches(id,business_id),unique(business_id,idempotency_key));
create index sales_branch_date on public.sales(branch_id,created_at);
create table public.sale_items(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,sale_id uuid not null references public.sales,variant_id uuid not null,qty integer not null check(qty>0),price bigint not null check(price>=0),discount bigint not null check(discount>=0),foreign key(variant_id,business_id) references public.product_variants(id,business_id),unique(sale_id,variant_id));
create table private.sale_costs(sale_item_id uuid primary key references public.sale_items,cost bigint not null);
alter table public.sale_items add column name_snapshot text not null;
create table public.payments(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,sale_id uuid not null references public.sales,method text not null check(method='cash'),amount bigint not null check(amount>=0),tendered bigint not null check(tendered>=amount),created_at timestamptz not null default now());
create table public.returns(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null references public.branches,sale_id uuid not null unique references public.sales,amount bigint not null,reason text not null,user_id uuid not null references auth.users,created_at timestamptz not null default now());
create table public.stock_transfers(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,source_id uuid not null,destination_id uuid not null,status text not null default 'pending' check(status in ('pending','shipped','received','cancelled')),user_id uuid not null references auth.users,created_at timestamptz not null default now(),check(source_id<>destination_id),foreign key(source_id,business_id) references public.branches(id,business_id),foreign key(destination_id,business_id) references public.branches(id,business_id));
create table public.transfer_items(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,transfer_id uuid not null references public.stock_transfers,variant_id uuid not null,qty integer not null check(qty>0),foreign key(variant_id,business_id) references public.product_variants(id,business_id),unique(transfer_id,variant_id));
create table public.inventory_movements(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,variant_id uuid not null,delta integer not null check(delta<>0),reason text not null,reference_id uuid,user_id uuid not null references auth.users,created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.branches(id,business_id),foreign key(variant_id,business_id) references public.product_variants(id,business_id));
create index movements_branch_date on public.inventory_movements(branch_id,created_at);
create table public.expenses(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,title text not null,amount bigint not null check(amount>0),user_id uuid not null references auth.users,created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.branches(id,business_id));
create table public.purchases(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,branch_id uuid not null,supplier_id uuid references public.suppliers,total bigint not null check(total>=0),paid bigint not null default 0 check(paid>=0 and paid<=total),created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.branches(id,business_id));
create table public.purchase_items(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,purchase_id uuid not null references public.purchases,variant_id uuid not null,qty integer not null check(qty>0),cost bigint not null check(cost>=0),foreign key(variant_id,business_id) references public.product_variants(id,business_id));
create table public.audit_logs(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,user_id uuid not null references auth.users,action text not null,record_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.products add constraint product_name_valid check(length(trim(name)) between 2 and 160);
alter table public.product_variants add constraint sku_valid check(length(trim(sku)) between 1 and 80);
alter table public.product_barcodes add constraint barcode_valid check(length(trim(barcode)) between 1 and 80);
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.branch_inventory,public.sales;end if;end $$;
-- No direct client writes. Authoritative functions validate user, tenant and branch.
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I enable row level security',t);end loop;end $$;
create policy businesses_read on public.businesses for select to authenticated using(private.member(id));
create policy memberships_read on public.memberships for select to authenticated using(user_id=auth.uid() or private.allowed(business_id,branch_id,array['super_admin','owner','manager']::public.staff_role[]));
create policy branches_read on public.branches for select to authenticated using(private.allowed(business_id,id,enum_range(null::public.staff_role)));
do $$ declare t text; begin foreach t in array array['products','product_variants','product_barcodes','categories'] loop execute format('create policy read_member on public.%I for select to authenticated using(private.member(business_id))',t);end loop;
foreach t in array array['branch_inventory','branch_prices','sales','inventory_movements','cash_registers','cash_shifts','returns'] loop execute format('create policy read_branch on public.%I for select to authenticated using(private.allowed(business_id,branch_id,enum_range(null::public.staff_role)))',t);end loop;
foreach t in array array['expenses','purchases'] loop execute format('create policy read_finance on public.%I for select to authenticated using(private.allowed(business_id,branch_id,array[''super_admin'',''owner'',''manager'',''accountant'']::public.staff_role[]))',t);end loop;end $$;
create policy transfers_read on public.stock_transfers for select to authenticated using(private.allowed(business_id,source_id,enum_range(null::public.staff_role)) or private.allowed(business_id,destination_id,enum_range(null::public.staff_role)));
create policy transfer_items_read on public.transfer_items for select to authenticated using(exists(select 1 from public.stock_transfers t where t.id=transfer_id));
create policy sale_items_read on public.sale_items for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
create policy payments_read on public.payments for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
create policy supplier_read on public.suppliers for select to authenticated using(private.allowed(business_id,null,array['super_admin','owner','accountant']::public.staff_role[]));
create policy purchase_items_read on public.purchase_items for select to authenticated using(exists(select 1 from public.purchases p where p.id=purchase_id));
create policy audit_read on public.audit_logs for select to authenticated using(private.allowed(business_id,null,array['super_admin','owner']::public.staff_role[]));
grant select on all tables in schema public to authenticated;
revoke insert,update,delete on all tables in schema public from anon,authenticated;
alter table private.costs enable row level security;
alter table private.sale_costs enable row level security;

create function private.move(b uuid,br uuid,v uuid,d integer,why text,ref uuid) returns void language plpgsql set search_path='' as $$ begin
 if d=0 then return;end if;
 insert into public.branch_inventory(business_id,branch_id,variant_id,quantity) values(b,br,v,0) on conflict do nothing;
 update public.branch_inventory set quantity=quantity+d where branch_id=br and variant_id=v and quantity+d>=0;
 if not found then raise exception 'الكمية المتوفرة غير كافية';end if;
 insert into public.inventory_movements(business_id,branch_id,variant_id,delta,reason,reference_id,user_id) values(b,br,v,d,why,ref,auth.uid());
end $$;

create function private.receipt(sid uuid) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('id',s.id,'total',s.total,'tax',s.tax,'discount',s.discount,'items',coalesce((select jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'name',i.name_snapshot,'qty',i.qty,'price',i.price,'discount',i.discount)) from public.sale_items i where i.sale_id=s.id),'[]'::jsonb)) from public.sales s where s.id=sid;
$$;
create function private.checkout(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid;br uuid:=(p->>'branch_id')::uuid;sh public.cash_shifts;sid uuid;old public.sales;r record;v public.product_variants;q integer;disc bigint;price bigint;sub bigint:=0;tax bigint;total bigint;od bigint:=(p->>'discount')::bigint;lineid uuid;rate integer;
begin
 select business_id into b from public.branches where id=br;
 if not private.allowed(b,br,array['super_admin','owner','manager','cashier']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||(p->>'key'),0));
 select * into old from public.sales where business_id=b and idempotency_key=(p->>'key')::uuid;
 if found then if old.request<>p or old.user_id<>auth.uid() then raise exception 'مفتاح مكرر لطلب مختلف';end if;return private.receipt(old.id);end if;
 select * into sh from public.cash_shifts where id=(p->>'shift_id')::uuid and branch_id=br and user_id=auth.uid() and closed_at is null for update;
 if not found then raise exception 'افتح وردية أولاً';end if;
 if jsonb_array_length(p->'items') not between 1 and 200 or od<0 or (select count(distinct x->>'variant_id') from jsonb_array_elements(p->'items') x)<>jsonb_array_length(p->'items') then raise exception 'سلة غير صالحة';end if;
 -- Stable lock order avoids multi-item checkout deadlocks.
 for r in select x from jsonb_array_elements(p->'items') x order by x->>'variant_id' loop
  select * into v from public.product_variants where id=(r.x->>'variant_id')::uuid and business_id=b for share;
  if not found or not exists(select 1 from public.products where id=v.product_id and active) then raise exception 'منتج غير متاح';end if;
  perform 1 from public.branch_inventory where branch_id=br and variant_id=v.id for update;
  q:=(r.x->>'qty')::integer;disc:=(r.x->>'discount')::bigint;
  select coalesce((select bp.price from public.branch_prices bp where bp.branch_id=br and bp.variant_id=v.id),v.price) into price;
  if q not between 1 and 100000 or disc<0 or disc>price*q then raise exception 'كمية أو خصم غير صالح';end if;
  if coalesce((select quantity from public.branch_inventory where branch_id=br and variant_id=v.id),0)<q then raise exception 'الكمية المتوفرة غير كافية';end if;
  sub:=sub+price*q-disc;
 end loop;
 if od>sub then raise exception 'الخصم يتجاوز المجموع';end if;
 select tax_bps into rate from public.businesses where id=b;tax:=round((sub-od)::numeric*rate/10000);total:=sub-od+tax;
 if (p->>'cash')::bigint<total then raise exception 'المبلغ المدفوع غير كاف';end if;
 insert into public.sales(business_id,branch_id,user_id,shift_id,idempotency_key,request,total,discount,tax) values(b,br,auth.uid(),sh.id,(p->>'key')::uuid,p,total,od,tax) returning id into sid;
 for r in select x from jsonb_array_elements(p->'items') x order by x->>'variant_id' loop
  select * into v from public.product_variants where id=(r.x->>'variant_id')::uuid;
  select coalesce((select bp.price from public.branch_prices bp where bp.branch_id=br and bp.variant_id=v.id),v.price) into price;
  q:=(r.x->>'qty')::integer;
  insert into public.sale_items(business_id,sale_id,variant_id,qty,price,discount,name_snapshot) values(b,sid,v.id,q,price,(r.x->>'discount')::bigint,(select name from public.products where id=v.product_id)) returning id into lineid;
  insert into private.sale_costs values(lineid,coalesce((select cost from private.costs where variant_id=v.id),0));
  perform private.move(b,br,v.id,-q,'sale',sid);
 end loop;
 insert into public.payments(business_id,sale_id,method,amount,tendered) values(b,sid,'cash',total,(p->>'cash')::bigint);
 insert into public.audit_logs(business_id,user_id,action,record_id) values(b,auth.uid(),'checkout',sid);
 return private.receipt(sid);
end $$;
create function public.checkout(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout(p); $$;

create table private.requests(business_id uuid not null references public.businesses,key uuid not null,user_id uuid not null references auth.users,action text not null,payload jsonb not null,result jsonb not null,primary key(business_id,key));
alter table private.requests enable row level security;
create function private.command(action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=(p->>'business_id')::uuid;br uuid:=(p->>'branch_id')::uuid;v uuid;pid uuid;rid uuid;tr public.stock_transfers;s public.sales;sh public.cash_shifts;r record;delta integer;expected_cash bigint;prior private.requests;
begin
 if auth.uid() is null then raise exception 'يرجى تسجيل الدخول';end if;
 if action in ('product','branch','staff','settings') then
 if not private.allowed(b,br,array['super_admin','owner','manager']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 elsif action in ('shift_open','shift_close') then
 if not private.allowed(b,br,array['super_admin','owner','manager','cashier']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 elsif action='expense' then
 if not private.allowed(b,br,array['super_admin','owner','manager','accountant']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 else
 if not private.allowed(b,br,array['super_admin','owner','manager','inventory']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||(p->>'key'),1));
 select * into prior from private.requests where business_id=b and key=(p->>'key')::uuid;
 if found then if prior.payload<>p or prior.action<>action or prior.user_id<>auth.uid() then raise exception 'مفتاح مكرر لطلب مختلف';end if;return prior.result;end if;
 if action='product' then
  pid:=nullif(p->>'product_id','')::uuid;
  if pid is null then insert into public.products(business_id,name,category,image_url,description) values(b,p->>'name',coalesce(p->>'category',''),coalesce(p->>'image_url',''),coalesce(p->>'description','')) returning id into pid;
  insert into public.product_variants(business_id,product_id,sku,price,min_stock) values(b,pid,p->>'sku',(p->>'price')::bigint,(p->>'min_stock')::integer) returning id into v;
  insert into public.product_barcodes(business_id,variant_id,barcode) values(b,v,p->>'barcode');
  else
   update public.products set name=p->>'name',category=p->>'category',image_url=p->>'image_url',description=p->>'description' where id=pid and business_id=b;
   if not found then raise exception 'منتج غير موجود';end if;
   v:=(p->>'variant_id')::uuid;
   update public.product_variants set sku=p->>'sku',price=(p->>'price')::bigint,min_stock=(p->>'min_stock')::integer where id=v and product_id=pid and business_id=b;
   if not found then raise exception 'متغير غير موجود';end if;
   update public.product_barcodes set barcode=p->>'barcode' where variant_id=v and business_id=b;
  end if;
  insert into private.costs values(v,(p->>'cost')::bigint) on conflict(variant_id) do update set cost=excluded.cost;rid:=pid;
 elsif action='stock' then
  delta:=(p->>'delta')::integer;if length(trim(p->>'reason'))<3 then raise exception 'أدخل سبب الحركة';end if;
  perform private.move(b,br,(p->>'variant_id')::uuid,delta,p->>'reason',null);
 elsif action='branch' then
  if not private.allowed(b,null,array['super_admin','owner']::public.staff_role[]) then raise exception 'غير مصرح';end if;
  insert into public.branches(business_id,name,address) values(b,p->>'name',coalesce(p->>'address','')) returning id into rid;
 elsif action='settings' then
  if not private.allowed(b,null,array['super_admin','owner']::public.staff_role[]) then raise exception 'غير مصرح';end if;
  update public.businesses set tax_bps=(p->>'tax_bps')::integer where id=b;rid:=b;
 elsif action='staff' then
  if not private.allowed(b,null,array['super_admin','owner']::public.staff_role[]) then raise exception 'غير مصرح';end if;
  insert into public.memberships(business_id,user_id,branch_id,role,display_name) values(b,(p->>'user_id')::uuid,br,(p->>'role')::public.staff_role,p->>'display_name') returning id into rid;
 elsif action='expense' then
  insert into public.expenses(business_id,branch_id,title,amount,user_id) values(b,br,p->>'title',(p->>'amount')::bigint,auth.uid()) returning id into rid;
 elsif action='shift_open' then
  insert into public.cash_shifts(business_id,branch_id,user_id,opening) values(b,br,auth.uid(),(p->>'opening')::bigint) returning id into rid;
 elsif action='shift_close' then
  select * into sh from public.cash_shifts where id=(p->>'id')::uuid and business_id=b and branch_id=br and user_id=auth.uid() and closed_at is null for update;
  if not found then raise exception 'وردية غير متاحة';end if;
  select sh.opening+coalesce(sum(total),0) into expected_cash from public.sales where shift_id=sh.id;
  select expected_cash-coalesce(sum(rtn.amount),0) into expected_cash from public.returns rtn where rtn.branch_id=br and rtn.user_id=auth.uid() and rtn.created_at>=sh.opened_at;
  update public.cash_shifts set closing=(p->>'closing')::bigint,expected=expected_cash,closed_at=now() where id=sh.id;rid:=sh.id;
 elsif action='transfer_create' then
  insert into public.stock_transfers(business_id,source_id,destination_id,user_id) values(b,br,(p->>'destination_id')::uuid,auth.uid()) returning id into rid;
  insert into public.transfer_items(business_id,transfer_id,variant_id,qty) values(b,rid,(p->>'variant_id')::uuid,(p->>'qty')::integer);
 elsif action in ('transfer_ship','transfer_receive','transfer_cancel') then
  select * into tr from public.stock_transfers where id=(p->>'id')::uuid and business_id=b for update;
  if not found or (action='transfer_receive' and br<>tr.destination_id) or (action<>'transfer_receive' and br<>tr.source_id) then raise exception 'الفرع غير مصرح';end if;
  if action='transfer_receive' and tr.status='received' then return jsonb_build_object('id',tr.id);end if;
  if action='transfer_ship' and tr.status='pending' then delta:=-1;
  elsif action='transfer_receive' and tr.status='shipped' then delta:=1;
  elsif action='transfer_cancel' and tr.status='pending' then delta:=0;
  else raise exception 'حالة التحويل غير صالحة';end if;
  for r in select * from public.transfer_items where transfer_id=tr.id order by variant_id loop perform private.move(b,br,r.variant_id,delta*r.qty,action,tr.id);end loop;
  update public.stock_transfers set status=case action when 'transfer_ship' then 'shipped' when 'transfer_receive' then 'received' else 'cancelled' end where id=tr.id;rid:=tr.id;
 elsif action in ('return','cancel_sale') then
  if not private.allowed(b,br,array['super_admin','owner','manager']::public.staff_role[]) then raise exception 'غير مصرح';end if;
  select * into s from public.sales where id=(p->>'id')::uuid and business_id=b and branch_id=br for update;
  if not found then raise exception 'فاتورة غير موجودة';end if;
  if s.status<>'completed' then return jsonb_build_object('id',s.id);end if;
  if length(trim(p->>'reason'))<3 then raise exception 'أدخل السبب';end if;
  for r in select * from public.sale_items where sale_id=s.id order by variant_id loop perform private.move(b,br,r.variant_id,r.qty,action,s.id);end loop;
  insert into public.returns(business_id,branch_id,sale_id,amount,reason,user_id) values(b,br,s.id,s.total,p->>'reason',auth.uid());
  update public.sales set status=case action when 'return' then 'returned' else 'cancelled' end where id=s.id;rid:=s.id;
 else raise exception 'عملية غير معروفة';
 end if;
 insert into public.audit_logs(business_id,user_id,action,record_id,details) values(b,auth.uid(),action,rid,p);
 insert into private.requests values(b,(p->>'key')::uuid,auth.uid(),action,p,jsonb_build_object('id',rid));
 return jsonb_build_object('id',rid);
end $$;
create function public.command(action text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.command(action,p); $$;

create function private.financials(b uuid,br uuid,from_date timestamptz,to_date timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare revenue bigint;cogs bigint;tax bigint;expense bigint;value bigint;
begin
 if not private.allowed(b,br,array['super_admin','owner','manager','accountant']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 select coalesce(sum(sales.total-sales.tax),0),coalesce(sum(sales.tax),0) into revenue,tax from public.sales where business_id=b and (br is null or branch_id=br) and created_at>=from_date and created_at<to_date and status='completed';
 select coalesce(sum(i.qty*c.cost),0) into cogs from public.sale_items i join private.sale_costs c on c.sale_item_id=i.id join public.sales s on s.id=i.sale_id where s.business_id=b and (br is null or s.branch_id=br) and s.created_at>=from_date and s.created_at<to_date and s.status='completed';
 select coalesce(sum(amount),0) into expense from public.expenses where business_id=b and (br is null or branch_id=br) and created_at>=from_date and created_at<to_date;
 select coalesce(sum(i.quantity*c.cost),0) into value from public.branch_inventory i join private.costs c on c.variant_id=i.variant_id where i.business_id=b and (br is null or i.branch_id=br);
 return jsonb_build_object('revenue',revenue,'tax',tax,'cogs',cogs,'expenses',expense,'gross',revenue-cogs,'net',revenue-cogs-expense,'inventory_value',value);
end $$;
create function public.financials(b uuid,br uuid,from_date timestamptz,to_date timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select private.financials(b,br,from_date,to_date); $$;
create function private.product_detail(b uuid,br uuid,v uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.allowed(b,br,array['super_admin','owner','manager']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 return (select jsonb_build_object('cost',c.cost,'description',p.description) from public.product_variants pv join public.products p on p.id=pv.product_id join private.costs c on c.variant_id=pv.id where pv.id=v and pv.business_id=b);
end $$;
create function public.product_detail(b uuid,br uuid,v uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.product_detail(b,br,v); $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.allowed(uuid,uuid,public.staff_role[]),private.member(uuid),private.checkout(jsonb),private.command(text,jsonb),private.financials(uuid,uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.checkout(jsonb),public.command(text,jsonb),public.financials(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.checkout(jsonb),public.command(text,jsonb),public.financials(uuid,uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.product_detail(uuid,uuid,uuid) from public,anon;
grant execute on function private.product_detail(uuid,uuid,uuid),public.product_detail(uuid,uuid,uuid) to authenticated;
