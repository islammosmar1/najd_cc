-- One-screen checkout: opening a zero-balance cash shift and recording a sale
-- are a single transaction. Failed checkouts don't leave an empty shift behind.
create function private.quick_checkout(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b uuid;br uuid:=(p->>'branch_id')::uuid;shift uuid;previous public.sales;
begin
 select business_id into b from public.branches where id=br;
 if not private.allowed(b,br,array['super_admin','owner','manager','cashier']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||br::text,7));
 select * into previous from public.sales where business_id=b and idempotency_key=(p->>'key')::uuid;
 if found then
  if previous.user_id<>auth.uid() or (previous.request-'shift_id')<>(p-'shift_id') then raise exception 'مفتاح مكرر لطلب مختلف';end if;
  return private.receipt(previous.id);
 end if;
 insert into public.cash_shifts(business_id,branch_id,user_id,opening)
 values(b,br,auth.uid(),0) on conflict(branch_id,user_id) where closed_at is null do nothing;
 select id into shift from public.cash_shifts where branch_id=br and user_id=auth.uid() and closed_at is null;
 return private.checkout(p||jsonb_build_object('shift_id',shift));
end $$;
create function public.quick_checkout(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.quick_checkout(p); $$;

-- Compare-and-set avoids overwriting a sale that occurred after the count form
-- was opened. Every actual delta is recorded through the same movement ledger.
create function private.set_stock(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b uuid:=(p->>'business_id')::uuid;br uuid:=(p->>'branch_id')::uuid;v uuid:=(p->>'variant_id')::uuid;k uuid:=(p->>'key')::uuid;current_qty integer;target integer:=(p->>'quantity')::integer;prior private.requests;result jsonb;
begin
 if not private.allowed(b,br,array['super_admin','owner','manager','inventory']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 if target is null or target<0 or target>1000000 or (p->>'expected_qty') is null or length(trim(coalesce(p->>'reason','')))<3 then raise exception 'أدخل كمية وسببًا صحيحين';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||k::text,1));
 select * into prior from private.requests where business_id=b and key=k;
 if found then
  if prior.payload<>p or prior.action<>'stock_set' or prior.user_id<>auth.uid() then raise exception 'مفتاح مكرر لطلب مختلف';end if;
  return prior.result;
 end if;
 insert into public.branch_inventory(business_id,branch_id,variant_id,quantity) values(b,br,v,0) on conflict do nothing;
 select quantity into current_qty from public.branch_inventory where branch_id=br and variant_id=v for update;
 if current_qty<>(p->>'expected_qty')::integer then raise exception 'تغير المخزون أثناء التعديل. حدّث البيانات وراجع الكمية ثم أعد المحاولة';end if;
 perform private.move(b,br,v,target-current_qty,p->>'reason',null);
 result:=jsonb_build_object('quantity',target,'delta',target-current_qty);
 insert into public.audit_logs(business_id,user_id,action,record_id,details) values(b,auth.uid(),'stock_set',v,p);
 insert into private.requests values(b,k,auth.uid(),'stock_set',p,result);
 return result;
end $$;
create function public.set_stock(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.set_stock(p); $$;

-- Accounting recognizes the original sale and its later refund in their own
-- periods, including historical COGS and the tax returned with a full refund.
create or replace function private.financials(b uuid,br uuid,from_date timestamptz,to_date timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare revenue bigint;tax_total bigint;expense bigint;value bigint;cogs bigint;refund_net bigint;refund_tax bigint;refund_cost bigint;
begin
 if not private.allowed(b,br,array['super_admin','owner','manager','accountant']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 select coalesce(sum(s.total-s.tax),0),coalesce(sum(s.tax),0) into revenue,tax_total from public.sales s where s.business_id=b and (br is null or s.branch_id=br) and s.created_at>=from_date and s.created_at<to_date;
 select coalesce(sum(i.qty*c.cost),0) into cogs from public.sale_items i join private.sale_costs c on c.sale_item_id=i.id join public.sales s on s.id=i.sale_id where s.business_id=b and (br is null or s.branch_id=br) and s.created_at>=from_date and s.created_at<to_date;
 select coalesce(sum(r.amount-s.tax),0),coalesce(sum(s.tax),0) into refund_net,refund_tax from public.returns r join public.sales s on s.id=r.sale_id where r.business_id=b and (br is null or r.branch_id=br) and r.created_at>=from_date and r.created_at<to_date;
 select coalesce(sum(i.qty*c.cost),0) into refund_cost from public.returns r join public.sale_items i on i.sale_id=r.sale_id join private.sale_costs c on c.sale_item_id=i.id where r.business_id=b and (br is null or r.branch_id=br) and r.created_at>=from_date and r.created_at<to_date;
 revenue:=revenue-refund_net;tax_total:=tax_total-refund_tax;cogs:=cogs-refund_cost;
 select coalesce(sum(e.amount),0) into expense from public.expenses e where e.business_id=b and (br is null or e.branch_id=br) and e.created_at>=from_date and e.created_at<to_date;
 select coalesce(sum(i.quantity*c.cost),0) into value from public.branch_inventory i join private.costs c on c.variant_id=i.variant_id where i.business_id=b and (br is null or i.branch_id=br);
 return jsonb_build_object('revenue',revenue,'tax',tax_total,'sales_gross',revenue+tax_total,'cogs',cogs,'expenses',expense,'gross',revenue-cogs,'net',revenue-cogs-expense,'inventory_value',value);
end $$;

revoke all on function private.quick_checkout(jsonb),private.set_stock(jsonb) from public,anon;
revoke all on function public.quick_checkout(jsonb),public.set_stock(jsonb) from public,anon;
grant execute on function private.quick_checkout(jsonb),private.set_stock(jsonb),public.quick_checkout(jsonb),public.set_stock(jsonb) to authenticated;

create function private.add_product(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=(p->>'business_id')::uuid;br uuid:=(p->>'branch_id')::uuid;k uuid:=(p->>'key')::uuid;result jsonb;v uuid;item jsonb;destination uuid;qty integer;already_done boolean;
begin
 if not private.allowed(b,br,array['super_admin','owner','manager']::public.staff_role[]) then raise exception 'غير مصرح';end if;
 if nullif(p->>'product_id','') is not null then raise exception 'تعديل الكمية يتم من شاشة المخزون';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||k::text,1));
 select exists(select 1 from private.requests where business_id=b and key=k) into already_done;
 result:=private.command('product',p);
 if already_done then return result;end if;
 select id into v from public.product_variants where product_id=(result->>'id')::uuid and business_id=b;
 if jsonb_typeof(p->'initial_stock')<>'array' or jsonb_array_length(p->'initial_stock')>100 then raise exception 'كميات الفروع غير صالحة';end if;
 if (select count(distinct x->>'branch_id') from jsonb_array_elements(p->'initial_stock') x)<>jsonb_array_length(p->'initial_stock') then raise exception 'تكرر الفرع في كميات المنتج';end if;
 for item in select x from jsonb_array_elements(p->'initial_stock') x order by x->>'branch_id' loop
  destination:=(item->>'branch_id')::uuid;qty:=(item->>'quantity')::integer;
  if not private.allowed(b,destination,array['super_admin','owner','manager','inventory']::public.staff_role[]) or qty is null or qty<0 or qty>1000000 then raise exception 'كمية أو فرع غير مصرح';end if;
  perform private.move(b,destination,v,qty,'رصيد افتتاحي للمنتج',(result->>'id')::uuid);
 end loop;
 return result;
end $$;
create function public.add_product(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.add_product(p); $$;
revoke all on function private.add_product(jsonb),public.add_product(jsonb) from public,anon;
grant execute on function private.add_product(jsonb),public.add_product(jsonb) to authenticated;
