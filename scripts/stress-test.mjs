#!/usr/bin/env node
/**
 * PNUT MONSTER stress/performance test suite.
 *
 * Uses Node's built-in fetch so it does not add vulnerable benchmark-only
 * dependencies to the project.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54331";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiJ9.demo";

const DURATION_SECS = Number(process.env.DURATION_SECS || 15);
const results = [];

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatLatency(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runWorker(opts, deadline, stats) {
  while (Date.now() < deadline) {
    const startedAt = performance.now();
    try {
      const response = await fetch(opts.url, {
        method: opts.method || "GET",
        headers: opts.headers,
        body: opts.body,
      });
      const body = await response.arrayBuffer();
      stats.bytes += body.byteLength;
      stats.requests += 1;
      if (response.status < 200 || response.status >= 300) stats.non2xx += 1;
    } catch {
      stats.errors += 1;
    } finally {
      stats.latencies.push(performance.now() - startedAt);
    }
  }
}

async function runTest(name, opts) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`TEST: ${name}`);
  console.log(`Connections: ${opts.connections} | Duration: ${opts.duration}s`);
  console.log(`${"=".repeat(72)}`);

  const stats = {
    requests: 0,
    errors: 0,
    non2xx: 0,
    bytes: 0,
    latencies: [],
  };
  const startedAt = Date.now();
  const deadline = startedAt + opts.duration * 1000;

  await Promise.all(
    Array.from({ length: opts.connections }, () =>
      runWorker(opts, deadline, stats)
    )
  );

  const elapsedSecs = Math.max(1, (Date.now() - startedAt) / 1000);
  const summary = {
    name,
    connections: opts.connections,
    duration: opts.duration,
    requests: {
      total: stats.requests,
      average_rps: stats.requests / elapsedSecs,
      mean_latency_ms:
        stats.latencies.reduce((sum, value) => sum + value, 0) /
        Math.max(1, stats.latencies.length),
      p50_ms: percentile(stats.latencies, 50),
      p95_ms: percentile(stats.latencies, 95),
      p99_ms: percentile(stats.latencies, 99),
      max_ms: Math.max(0, ...stats.latencies),
    },
    throughput: {
      average_bytes_sec: stats.bytes / elapsedSecs,
      total_bytes: stats.bytes,
    },
    errors: stats.errors,
    timeouts: 0,
    non2xx: stats.non2xx,
  };

  results.push(summary);

  console.log(`Total Requests: ${summary.requests.total}`);
  console.log(`Avg RPS:        ${summary.requests.average_rps.toFixed(1)} req/s`);
  console.log(`Latency Mean:   ${formatLatency(summary.requests.mean_latency_ms)}`);
  console.log(`Latency p50:    ${formatLatency(summary.requests.p50_ms)}`);
  console.log(`Latency p95:    ${formatLatency(summary.requests.p95_ms)}`);
  console.log(`Latency p99:    ${formatLatency(summary.requests.p99_ms)}`);
  console.log(`Latency Max:    ${formatLatency(summary.requests.max_ms)}`);
  console.log(`Throughput:     ${formatBytes(summary.throughput.average_bytes_sec)}/s`);
  console.log(`Errors:         ${summary.errors}`);
  console.log(`Non-2xx:        ${summary.non2xx}`);

  return summary;
}

async function main() {
  console.log("\nPNUT MONSTER stress/performance test suite");
  console.log(`Server:   ${BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);

  await runTest("Homepage warm-up", {
    url: `${BASE_URL}/`,
    connections: 10,
    duration: 5,
  });

  await runTest("Homepage 50 concurrent users", {
    url: `${BASE_URL}/`,
    connections: 50,
    duration: DURATION_SECS,
  });

  await runTest("Login page 50 concurrent users", {
    url: `${BASE_URL}/login`,
    connections: 50,
    duration: DURATION_SECS,
  });

  await runTest("Admin login 30 concurrent users", {
    url: `${BASE_URL}/admin/login`,
    connections: 30,
    duration: DURATION_SECS,
  });

  await runTest("Supabase outlets public read", {
    url: `${SUPABASE_URL}/rest/v1/outlets?is_active=eq.true&select=id,name,address,is_active`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 50,
    duration: DURATION_SECS,
  });

  await runTest("Supabase menu items public read", {
    url: `${SUPABASE_URL}/rest/v1/menu_items?is_active=eq.true&select=id,name,base_price,subcategory_id`,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    connections: 100,
    duration: DURATION_SECS,
  });

  console.log(`\n${"=".repeat(72)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(72)}`);
  for (const result of results) {
    console.log(
      `${result.name.padEnd(36)} ${String(result.connections).padStart(4)} conn ` +
        `${result.requests.average_rps.toFixed(1).padStart(8)} rps ` +
        `p95 ${formatLatency(result.requests.p95_ms).padStart(8)} ` +
        `errors ${String(result.errors + result.non2xx).padStart(5)}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
