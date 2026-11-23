import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { certificate } from "./site";

export const SYNTHETIC_SECRET = "synthetic-secret-value";

type Visit = { method: string; path: string; search: string };

function page(heading: string, script: string) {
  return `<!doctype html><html lang="en"><title>Observation fixture</title><h1>${heading}</h1>${script}</html>`;
}

const pages: Record<string, { body: string; headers?: Record<string, string> }> = {
  "/": { body: page("Release ready", "") },
  // The exact anonymous session request, a wrong query, a wrong method and a redirect that ends on the
  // same URL. An unrelated console error echoes the synthetic value.
  "/session": {
    body: page("Loading", `<script src="/required.js"></script><script>
      Promise.allSettled([
        fetch("/auth/session"),
        fetch("/auth/session?probe=${SYNTHETIC_SECRET}"),
        fetch("/auth/session", { method: "POST" }),
        fetch("/old-session"),
      ]).then(() => {
        console.error("unrelated diagnostic ${SYNTHETIC_SECRET}");
        document.querySelector("h1").textContent = "Release ready";
      });
    </script>`),
  },
  // An enforced connect-src block that issues no request, a report-only image violation whose image
  // still loads, and a same-origin transport failure.
  "/csp": {
    headers: {
      "content-security-policy": "connect-src 'self'",
      "content-security-policy-report-only": "img-src 'none'",
    },
    body: page("Loading", `<img src="/pixel.gif" alt=""><script>
      Promise.allSettled([fetch("https://127.0.0.1:9/blocked"), fetch("/drop")]).then(() => {
        document.querySelector("h1").textContent = "Release ready";
      });
    </script>`),
  },
  // A 503 then 200 for one required request before the assertion, a required body that fails after
  // 200 headers, and a required request that fails after the load event.
  "/timing": {
    body: page("Loading", `<script>
      (async () => {
        const first = await fetch("/flaky", { cache: "no-store" });
        if (!first.ok) await fetch("/flaky", { cache: "no-store" });
        fetch("/partial", { cache: "no-store" }).then(r => r.text()).catch(() => {});
        document.querySelector("h1").textContent = "Release ready";
      })();
      addEventListener("load", () => setTimeout(() => fetch("/late", { cache: "no-store" }).catch(() => {}), 1500));
    </script>`),
  },
  // Two matching attempts start before the assertion. One completes and the other holds its body.
  "/overlap": {
    body: page("Loading", `<script>
      const attempts = [1, 2].map(() => fetch("/overlap-data", { cache: "no-store" }).then(r => r.text()));
      Promise.any(attempts).then(() => { document.querySelector("h1").textContent = "Release ready"; });
      Promise.allSettled(attempts);
    </script>`),
  },
};

const pixel = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

export async function startObservationSite() {
  const directory = mkdtempSync(join(tmpdir(), "vh-adlc-website-observe-"));
  const visits: Visit[] = [];
  const sockets = new Set<Socket>();
  const counts = new Map<string, number>();
  let server: Server | undefined;

  function dispose() {
    for (const socket of sockets) socket.destroy();
    server?.close();
    rmSync(directory, { recursive: true, force: true });
  }

  try {
    server = createServer(certificate(directory), (req, res) => {
      const url = new URL(req.url ?? "/", "https://fixture.invalid");
      visits.push({ method: req.method ?? "", path: url.pathname, search: url.search });
      const count = (counts.get(url.pathname) ?? 0) + 1;
      counts.set(url.pathname, count);
      const noStore = { "cache-control": "no-store" };
      const fixture = pages[url.pathname];
      if (fixture) {
        res.writeHead(200, { "content-type": "text/html", ...noStore, ...fixture.headers });
        res.end(fixture.body);
        return;
      }
      switch (url.pathname) {
        case "/auth/session":
          res.writeHead(401, { "content-type": "application/json", ...noStore });
          res.end('{"errors":[{"status":"401"}]}');
          return;
        case "/old-session":
          res.writeHead(302, { location: "/auth/session", ...noStore });
          res.end();
          return;
        case "/required.js":
          res.writeHead(401, { "content-type": "application/javascript", ...noStore });
          res.end("unauthorized");
          return;
        case "/pixel.gif":
          res.writeHead(200, { "content-type": "image/gif", ...noStore });
          res.end(pixel);
          return;
        case "/drop":
          req.socket.destroy();
          return;
        case "/flaky":
          res.writeHead(count === 1 ? 503 : 200, { "content-type": "text/plain", ...noStore });
          res.end(count === 1 ? "unavailable" : "ok");
          return;
        case "/partial":
          res.writeHead(200, { "content-type": "text/plain", "content-length": "4096", ...noStore });
          res.write("partial", () => { req.socket.destroy(); });
          return;
        case "/late":
          res.writeHead(500, { "content-type": "text/plain", ...noStore });
          res.end("late failure");
          return;
        case "/overlap-data":
          if (count === 1) {
            res.writeHead(200, { "content-type": "text/plain", ...noStore });
            res.end("complete");
          } else {
            res.writeHead(200, { "content-type": "text/plain", "content-length": "4096", ...noStore });
            res.write("held");
          }
          return;
        default:
          res.writeHead(404, noStore);
          res.end("not found");
      }
    });
    server.on("secureConnection", (socket: Socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address: AddressInfo | string | null = server.address();
    if (!address || typeof address === "string") throw new Error("Observation fixture has no TCP address");
    return { origin: `https://127.0.0.1:${address.port}`, caFile: join(directory, "ca.pem"), visits, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
