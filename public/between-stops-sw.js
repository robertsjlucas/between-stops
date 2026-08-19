const CACHE_NAME = "between-stops-offline-v1";
const OFFLINE_MEDIA_PREFIX = "/between-stops-offline-media/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function rangeResponse(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;

  const bytes = await response.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return response;

  const start = Number(match[1]);
  const end = match[2]
    ? Math.min(Number(match[2]), bytes.byteLength - 1)
    : bytes.byteLength - 1;
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");

  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith(OFFLINE_MEDIA_PREFIX)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        return cached
          ? rangeResponse(event.request, cached)
          : new Response("Offline media unavailable", { status: 404 });
      })
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (url.pathname === "/tours") {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/tours", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/tours");
          return cached ?? new Response("Between Stops is unavailable offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
    return;
  }

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/branding/") ||
      url.pathname === "/icon.png")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(event.request);
          return cached ?? new Response("Asset unavailable", { status: 404 });
        }
      })
    );
  }
});
