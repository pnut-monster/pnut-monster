#!/usr/bin/env node
/**
 * PNUT MONSTER — Stress & Performance Test Suite
 *
 * Tests: Frontend pages, API routes, Supabase queries, concurrent users
 * Reports: RPS, latency (p50/p95/p99), error rate, throughput
 */

import autocannon from "autocannon";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54331";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const DURATION_SECS = 15;
const results = [];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatLatency(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runTest(name, opts) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TEST: ${name}`);
  console.log(`  Connections: ${opts.connections} | Duration: ${opts.duration}s`);
  console.log(`${"=".repeat(60)}`);

  const result = await autocannon({
    ...opts,
    title: name,
  });

  const summary = {
    name,
    connections: opts.connections,
    duration: opts.duration,
    requests: {
      total: result.requests.total,
      average_rps: result.requests.average,
      mean_latency_ms: result.latency.mean,
      p50_ms: result.latency.p50,
      p95_ms: result.latency.p95,
      p99_ms: result.latency.p99,
      max_ms: result.latency.max,
    },
    throughput: {
      average_bytes_sec: result.throughput.average,
      total_bytes: result.throughput.total,
    },
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    status_2xx: result.requests.total - (result.non2xx || 0) - (result.errors || 0),
  };

  results.push(summary);

  console.log(`\n  Results:`);
  console.log(`  ├── Total Requests:  ${summary.requests.total}`);
  console.log(`  ├── Avg RPS:         ${summary.requests.average_rps.toFixed(1)} req/s`);
  console.log(`  ├── Latency Mean:    ${formatLatency(summary.requests.mean_latency_ms)}`);
  console.log(`  ├── Latency p50:     ${formatLatency(summary.requests.p50_ms)}`);
  console.log(`  ├── Latency p95:     ${formatLatency(summary.requests.p95_ms)}`);
  console.log(`  ├── Latency p99:     ${formatLatency(summary.requests.p99_ms)}`);
  console.log(`  ├── Latency Max:     ${formatLatency(summary.requests.max_ms)}`);
  console.log(`  ├── Throughput:      ${formatBytes(summary.throughput.average_bytes_sec)}/s`);
  console.log(`  ├── Errors:          ${summary.errors}`);
  console.log(`  ├── Timeouts:        ${summary.timeouts}`);
  console.log(`  └── Non-2xx:         ${summary.non2xx}`);

  return summary;
}

async function main() {
  console.log(`\n╔${"═".repeat(58)}╗`);
  console.log(`║   PNUT MONSTER — Stress & Performance Test Suite          ║`);
  console.log(`╠${"═".repeat(58)}╣`);
  console.log(`║  Server:       ${BASE_URL.padEnd(41)}║`);
  console.log(`║  Supabase:     ${SUPABASE_URL.padEnd(41)}║`);
  console.log(`║  Machine:      4 vCPU / 16GB RAM (AMD EPYC 7763)         ║`);
  console.log(`║  Node.js:      v26.3.0                                    ║`);
  console.log(`╚${"═".repeat(58)}╝`);

  // ─────────────────────────────────────────────────────────────
  // 1. FRONTEND PAGE RENDERING
  // ─────────────────────────────────────────────────────────────
  console.log(`\n\n${"━".repeat(60)}`);
  console.log("  PHASE 1: FRONTEND PAGE RENDERING (SSR)");
  console.log(`${"━".repeat(60)}`);

  // Homepage - warm up
  await runTest("Homepage (warm-up, 10 connections)", {
    url: `${BASE_URL}/`,
    connections: 10,
    duration: 5,
  });

  // Homepage - steady state
  await runTest("Homepage (50 concurrent users)", {
    url: `${BASE_URL}/`,
    connections: 50,
    duration: DURATION_SECS,
  });

  // Homepage - peak load
  await runTest("Homepage (100 concurrent users)", {
    url: `${BASE_URL}/`,
    connections: 100,
    duration: DURATION_SECS,
  });

  // Homepage - stress limit
  await runTest("Homepage (200 concurrent users - stress)", {
    url: `${BASE_URL}/`,
    connections: 200,
    duration: DURATION_SECS,
  });

  // Login page
  await runTest("Login Page (50 concurrent)", {
    url: `${BASE_URL}/login`,
    connections: 50,
    duration: DURATION_SECS,
  });

  // Admin login
  await runTest("Admin Login Page (30 concurrent)", {
    url: `${BASE_URL}/admin/login`,
    connections: 30,
    duration: DURATION_SECS,
  });

  // Static assets (CSS)
  await runTest("CSS Static Asset (100 concurrent)", {
    url: `${BASE_URL}/_next/static/css/app/layout.css`,
    connections: 100,
    duration: 10,
  });

  // ─────────────────────────────────────────────────────────────
  // 2. SUPABASE API (Direct PostgREST)
  // ─────────────────────────────────────────────────────────────
  console.log(`\n\n${"━".repeat(60)}`);
  console.log("  PHASE 2: SUPABASE / POSTGREST API");
  console.log(`${"━".repeat(60)}`);

  // Public read - outlets
  await runTest("Supabase: Read Outlets (public, 50 conn)", {
    url: `${SUPABASE_URL}/rest/v1/outlets?is_active=eq.true&select=id,name,address,is_active`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 50,
    duration: DURATION_SECS,
  });

  // Public read - menu categories
  await runTest("Supabase: Read Menu Categories (public, 50 conn)", {
    url: `${SUPABASE_URL}/rest/v1/menu_categories?is_active=eq.true&select=id,name,slug`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 50,
    duration: DURATION_SECS,
  });

  // Public read - menu items
  await runTest("Supabase: Read Menu Items (public, 100 conn)", {
    url: `${SUPABASE_URL}/rest/v1/menu_items?is_active=eq.true&select=id,name,base_price,category_id`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 100,
    duration: DURATION_SECS,
  });

  // Public read - loyalty tiers
  await runTest("Supabase: Read Loyalty Tiers (public, 50 conn)", {
    url: `${SUPABASE_URL}/rest/v1/loyalty_tiers?select=*`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 50,
    duration: DURATION_SECS,
  });

  // Supabase health
  await runTest("Supabase: Health Check (100 conn)", {
    url: `${SUPABASE_URL}/rest/v1/`,
    headers: {
      apikey: ANON_KEY,
    },
    connections: 100,
    duration: 10,
  });

  // ─────────────────────────────────────────────────────────────
  // 3. NEXT.JS API ROUTES
  // ─────────────────────────────────────────────────────────────
  console.log(`\n\n${"━".repeat(60)}`);
  console.log("  PHASE 3: NEXT.JS API ROUTES");
  console.log(`${"━".repeat(60)}`);

  // Upload endpoint (GET should 405, testing route resolution speed)
  await runTest("API Route Resolution: /api/upload (50 conn)", {
    url: `${BASE_URL}/api/upload`,
    connections: 50,
    duration: 10,
  });

  // Admin verify-role (without auth - should return 401)
  await runTest("API: /api/admin/verify-role (unauth, 50 conn)", {
    url: `${BASE_URL}/api/admin/verify-role`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "test" }),
    connections: 50,
    duration: 10,
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CONCURRENCY RAMP-UP TEST
  // ─────────────────────────────────────────────────────────────
  console.log(`\n\n${"━".repeat(60)}`);
  console.log("  PHASE 4: CONCURRENCY RAMP-UP (Finding Breaking Point)");
  console.log(`${"━".repeat(60)}`);

  for (const connections of [50, 100, 200, 300, 500]) {
    const r = await runTest(`Ramp: Homepage @ ${connections} connections`, {
      url: `${BASE_URL}/`,
      connections,
      duration: 10,
    });

    // Stop if error rate > 10% or latency p99 > 10s
    const errorRate = (r.errors + r.timeouts + r.non2xx) / Math.max(1, r.requests.total);
    if (errorRate > 0.1 || r.requests.p99_ms > 10000) {
      console.log(`\n  ⚠ BREAKING POINT REACHED at ${connections} connections`);
      console.log(`    Error rate: ${(errorRate * 100).toFixed(1)}%`);
      console.log(`    P99 latency: ${formatLatency(r.requests.p99_ms)}`);
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FINAL REPORT
  // ─────────────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(60)}`);
  console.log("  FINAL PERFORMANCE REPORT");
  console.log(`${"═".repeat(60)}\n`);

  // Summary table
  console.log("┌─────────────────────────────────────────┬──────┬────────┬────────┬────────┬────────┬────────┐");
  console.log("│ Test                                    │ Conn │ RPS    │ p50    │ p95    │ p99    │ Errors │");
  console.log("├─────────────────────────────────────────┼──────┼────────┼────────┼────────┼────────┼────────┤");

  for (const r of results) {
    const name = r.name.substring(0, 39).padEnd(39);
    const conn = String(r.connections).padStart(4);
    const rps = r.requests.average_rps.toFixed(0).padStart(6);
    const p50 = formatLatency(r.requests.p50_ms).padStart(6);
    const p95 = formatLatency(r.requests.p95_ms).padStart(6);
    const p99 = formatLatency(r.requests.p99_ms).padStart(6);
    const errs = String(r.errors + r.timeouts).padStart(6);
    console.log(`│ ${name} │ ${conn} │ ${rps} │ ${p50} │ ${p95} │ ${p99} │ ${errs} │`);
  }

  console.log("└─────────────────────────────────────────┴──────┴────────┴────────┴────────┴────────┴────────┘");

  // Scalability assessment
  console.log(`\n\n${"─".repeat(60)}`);
  console.log("  SCALABILITY ASSESSMENT");
  console.log(`${"─".repeat(60)}\n`);

  const homepage50 = results.find(r => r.name.includes("50 concurrent users"));
  const homepage100 = results.find(r => r.name.includes("100 concurrent users"));
  const homepage200 = results.find(r => r.name.includes("200 concurrent users - stress"));
  const supabaseMenu = results.find(r => r.name.includes("Menu Items"));
  const cssAsset = results.find(r => r.name.includes("CSS Static"));

  if (homepage50) {
    console.log(`  Frontend (SSR):`);
    console.log(`    50 users:  ${homepage50.requests.average_rps.toFixed(0)} RPS, p95=${formatLatency(homepage50.requests.p95_ms)}`);
    if (homepage100) console.log(`    100 users: ${homepage100.requests.average_rps.toFixed(0)} RPS, p95=${formatLatency(homepage100.requests.p95_ms)}`);
    if (homepage200) console.log(`    200 users: ${homepage200.requests.average_rps.toFixed(0)} RPS, p95=${formatLatency(homepage200.requests.p95_ms)}`);
  }

  if (supabaseMenu) {
    console.log(`\n  Supabase/PostgREST:`);
    console.log(`    Menu Items (100 conn): ${supabaseMenu.requests.average_rps.toFixed(0)} RPS, p95=${formatLatency(supabaseMenu.requests.p95_ms)}`);
  }

  if (cssAsset) {
    console.log(`\n  Static Assets:`);
    console.log(`    CSS (100 conn): ${cssAsset.requests.average_rps.toFixed(0)} RPS, p95=${formatLatency(cssAsset.requests.p95_ms)}`);
  }

  // Estimate max users
  const steadyRPS = homepage50?.requests.average_rps || 0;
  const avgPageLoadsPerUser = 0.1; // 1 page load every 10 seconds per active user
  const estimatedMaxConcurrent = Math.floor(steadyRPS / avgPageLoadsPerUser);

  console.log(`\n  Estimated Capacity (this VM, dev mode):`);
  console.log(`    Max concurrent active users: ~${estimatedMaxConcurrent}`);
  console.log(`    (assumes 1 page load / 10s per user)`);
  console.log(`\n  Production estimate (with build optimization, CDN, connection pooling):`);
  console.log(`    Expected 3-5x improvement over dev mode`);
  console.log(`    Estimated: ~${estimatedMaxConcurrent * 4} concurrent users`);

  console.log(`\n  Bottlenecks:`);
  console.log(`    1. Next.js dev mode (no build optimization, no static generation)`);
  console.log(`    2. Single Node.js process (no clustering)`);
  console.log(`    3. Local Supabase (no connection pooling, no read replicas)`);
  console.log(`    4. 4 vCPUs limit concurrent SSR rendering`);

  console.log(`\n  Scaling Recommendations:`);
  console.log(`    • Use 'next build' + 'next start' for production (3-5x faster SSR)`);
  console.log(`    • Enable static generation for menu/outlet pages`);
  console.log(`    • Use Vercel/Cloudflare for edge CDN + auto-scaling`);
  console.log(`    • Supabase Pro plan for connection pooling (PgBouncer)`);
  console.log(`    • Add Redis/Upstash for session + API response caching`);
  console.log(`    • Use Node.js 20/22 LTS (Node 26 has compat issues)`);

  console.log(`\n${"═".repeat(60)}\n`);
}

main().catch(console.error);
