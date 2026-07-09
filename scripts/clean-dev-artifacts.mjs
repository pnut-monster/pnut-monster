import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const generatedServiceWorker = resolve(process.cwd(), "public", "sw.js");

const devResetServiceWorker = `// Development-only service worker reset.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await self.caches.keys();
    await Promise.all(keys.map((key) => self.caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();

    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});
`;

try {
  await mkdir(resolve(process.cwd(), "public"), { recursive: true });
  await writeFile(generatedServiceWorker, devResetServiceWorker);
} catch (error) {
  console.warn(
    `[clean-dev-artifacts] Could not write ${generatedServiceWorker}:`,
    error instanceof Error ? error.message : error
  );
}
