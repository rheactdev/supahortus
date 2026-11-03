const transferPath = "/api/storage/transfer";

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === transferPath &&
      event.request.method === "GET") {
    event.respondWith(transfer(event.request));
  }
});

async function transfer(request) {
  try {
    const response = await fetch(request.url, {
      headers: { "x-hortus-transfer": "descriptor" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return response;
    const descriptor = await response.json();
    const headers = new Headers(descriptor.headers);
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);
    const object = await fetch(descriptor.url, {
      headers,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: request.signal,
    });
    const resultHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Type": descriptor.contentType,
      "Content-Disposition": descriptor.disposition,
    });
    for (const name of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"]) {
      const value = object.headers.get(name);
      if (value !== null) resultHeaders.set(name, value);
    }
    if (!object.ok && object.status !== 416) {
      return new Response("Encrypted object transfer failed", { status: 502 });
    }
    return new Response(object.body, { status: object.status, headers: resultHeaders });
  } catch {
    return new Response("Encrypted object transfer failed", { status: 502 });
  }
}
