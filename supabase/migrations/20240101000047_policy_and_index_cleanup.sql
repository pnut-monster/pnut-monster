-- Trigger functions are never API endpoints.
revoke execute on function public.ensure_customer_address_default()
  from public, anon, authenticated;

-- Make the intentional deny-by-default boundary explicit to the advisor.
create policy "payment_attempts: deny client access"
  on public.payment_attempts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Avoid per-row auth function initialization in existing RLS predicates.
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    v_using := case when p.qual is null then null
      else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    v_check := case when p.with_check is null then null
      else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end;
$$;

-- Add indexes for foreign-key leading columns that do not already have one.
do $$
declare
  fk record;
  v_columns text;
  v_index_name text;
begin
  for fk in
    select c.oid, c.conrelid, c.conname, n.nspname, t.relname, c.conkey
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
      )
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ordinality)
    into v_columns
    from unnest(fk.conkey) with ordinality k(attnum, ordinality)
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    v_index_name := left('idx_' || fk.relname || '_' || replace(fk.conname, '_fkey', ''), 63);
    execute format('create index if not exists %I on %I.%I (%s)',
      v_index_name, fk.nspname, fk.relname, v_columns);
  end loop;
end;
$$;
