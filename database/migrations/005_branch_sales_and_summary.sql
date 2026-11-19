-- Sale attribution follows the selected store; stock locks/deductions use the pool.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('private.checkout(jsonb)'::regprocedure);
 definition:=replace(definition,'declare b uuid;br uuid','declare b uuid;stock_br uuid;br uuid');
 definition:=replace(definition,'select business_id into b from public.branches where id=br;',
  'select business_id into b from public.branches where id=br; stock_br:=coalesce((select branch_id from public.inventory_pools where business_id=b),br);');
 definition:=replace(definition,'where branch_id=br and variant_id=v.id','where branch_id=stock_br and variant_id=v.id');
 if position('stock_br uuid' in definition)=0 or position('branch_id=stock_br' in definition)=0 then raise exception 'checkout migration mismatch';end if;
 execute definition;
end $$;

create function private.daily_summary(b uuid,br uuid,from_date timestamptz,to_date timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare revenue bigint;pieces bigint;tickets bigint;stock_total bigint;
begin
 if not private.allowed(b,br,enum_range(null::public.staff_role))
 or not exists(select 1 from public.branches where id=br and business_id=b)
 then raise exception 'غير مصرح';end if;
 select coalesce(sum(s.total),0),count(*) into revenue,tickets from public.sales s
 where s.business_id=b and s.branch_id=br and s.status='completed' and s.created_at>=from_date and s.created_at<to_date;
 select coalesce(sum(i.qty),0) into pieces from public.sale_items i join public.sales s on s.id=i.sale_id
 where s.business_id=b and s.branch_id=br and s.status='completed' and s.created_at>=from_date and s.created_at<to_date;
 select coalesce(sum(quantity),0) into stock_total from public.branch_inventory where business_id=b;
 return jsonb_build_object('sales',revenue,'pieces',pieces,'tickets',tickets,'stock',stock_total);
end $$;
create function public.daily_summary(b uuid,br uuid,from_date timestamptz,to_date timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select private.daily_summary(b,br,from_date,to_date); $$;
revoke all on function private.daily_summary(uuid,uuid,timestamptz,timestamptz),public.daily_summary(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function private.daily_summary(uuid,uuid,timestamptz,timestamptz),public.daily_summary(uuid,uuid,timestamptz,timestamptz) to authenticated;
create index sales_business_created_idx on public.sales(business_id,created_at desc,id);
