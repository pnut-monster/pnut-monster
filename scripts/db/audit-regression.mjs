import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  const { rows: tables } = await client.query(`
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('checkout_quotes', 'api_rate_limits')
  `);
  assert.equal(tables.length, 2);
  assert.ok(tables.every((table) => table.relrowsecurity));

  const { rows: columnRows } = await client.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'checkout_quote_id'
  `);
  assert.equal(columnRows.length, 1);

  const { rows: privilegeRows } = await client.query(`
    select p.rolname,
      has_function_privilege(p.rolname, 'public.create_checkout_quote(uuid,jsonb,jsonb,numeric,integer,numeric)', 'execute') as quote_execute,
      has_function_privilege(p.rolname, 'public.consume_api_rate_limit(text,text,integer,integer)', 'execute') as limit_execute
    from pg_roles p where p.rolname in ('anon', 'authenticated', 'service_role')
    order by p.rolname
  `);
  for (const row of privilegeRows) {
    if (row.rolname === "service_role") {
      assert.equal(row.quote_execute, true);
      assert.equal(row.limit_execute, true);
    } else {
      assert.equal(row.quote_execute, false);
      assert.equal(row.limit_execute, false);
    }
  }

  const { rows: rpcRows } = await client.query(`
    select has_function_privilege('authenticated',
      'public.replace_coupon_outlet_restrictions(uuid,uuid[])', 'execute') as allowed
  `);
  assert.equal(rpcRows[0].allowed, true);

  const { rows: fixtureRows } = await client.query(`
    select p.id as user_id, o.id as outlet_id, mi.id as item_id
    from profiles p
    cross join lateral (
      select id from outlets where is_active and not coalesce(is_manually_closed, false) limit 1
    ) o
    cross join lateral (
      select mi.id from menu_items mi
      where mi.is_active and not exists (
        select 1 from item_customization_groups g
        where g.item_id = mi.id and g.is_required
      ) limit 1
    ) mi
    where p.role = 'customer'
    limit 1
  `);
  if (fixtureRows.length === 1) {
    const fixture = fixtureRows[0];
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    const { rows: quoteRows } = await client.query(
      `select public.create_checkout_quote($1, $2::jsonb, $3::jsonb, 0, 0, 0) as quote`,
      [
        fixture.user_id,
        JSON.stringify({ outlet_id: fixture.outlet_id }),
        JSON.stringify([{ item_id: fixture.item_id, quantity: 1, customizations: [] }]),
      ]
    );
    assert.ok(Number(quoteRows[0].quote.amount_paise) > 0);
    await client.query("rollback");
  } else {
    console.warn("Checkout quote execution skipped: local customer/menu fixtures are absent.");
  }
  console.log("Database audit regression checks passed.");
} finally {
  await client.end();
}
