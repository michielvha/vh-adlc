import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Visit = { server: string; method: string; path: string };

function runOpenSSL(directory: string, args: string[]) {
  const result = Bun.spawnSync(["openssl", ...args], { cwd: directory, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function certificate(directory: string) {
  runOpenSSL(directory, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Website Check Fixture CA", "-keyout", "ca.key", "-out", "ca.pem",
  ]);
  runOpenSSL(directory, [
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", "site.key", "-out", "site.csr",
  ]);
  runOpenSSL(directory, [
    "x509", "-req", "-days", "1", "-in", "site.csr", "-CA", "ca.pem",
    "-CAkey", "ca.key", "-CAcreateserial", "-copy_extensions", "copy", "-out", "site.pem",
  ]);
  return { key: readFileSync(join(directory, "site.key")), cert: readFileSync(join(directory, "site.pem")) };
}

function serviceFailure() {
  return new Response("unavailable", { status: 503, headers: { "content-type": "application/javascript" } });
}

function page(body: string) {
  return new Response(`<!doctype html><html lang="en"><title>Smoke fixture</title><h1>Release ready</h1>${body}</html>`, {
    headers: { "content-type": "text/html" },
  });
}

export function startSite() {
  const directory = mkdtempSync(join(tmpdir(), "vh-adlc-website-"));
  const visits: Visit[] = [];
  const servers: { stop(closeActiveConnections?: boolean): void }[] = [];

  function onRequest(server: string, req: Request) {
    const { pathname } = new URL(req.url);
    visits.push({ server, method: req.method, path: pathname });
    return pathname;
  }

  function dispose() {
    for (const server of servers.reverse()) server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }

  try {
    const tls = certificate(directory);
    const excluded = Bun.serve({
      hostname: "127.0.0.1", port: 0, tls,
      fetch(req) {
        onRequest("excluded", req);
        return new Response("out of scope");
      },
    });
    servers.push(excluded);
    const excludedURL = `https://127.0.0.1:${excluded.port}`;
    const local = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch(req) {
        const path = onRequest("http", req);
        if (path === "/upgrade") return Response.redirect(`${deploymentURL}/downgrade`);
        if (path === "/downgraded") return new Response("downgrade destination");
        if (path === "/service") return page('<script src="/service.js"></script>');
        if (path === "/service.js") return serviceFailure();
        return path === "/" ? page("") : new Response("not found", { status: 404 });
      },
    });
    servers.push(local);
    const localURL = `http://127.0.0.1:${local.port}`;
    const deployment = Bun.serve({
      hostname: "127.0.0.1", port: 0, tls,
      fetch(req) {
        switch (onRequest("https", req)) {
          case "/": return page("");
          case "/allowed": return Response.redirect(`${deploymentURL}/`);
          case "/redirect": return Response.redirect(`${excludedURL}/navigation`);
          case "/resources": return page('<script src="/asset"></script>');
          case "/asset": return Response.redirect(`${excludedURL}/asset`);
          case "/worker":
            return page('<script>document.querySelector("h1").textContent = "Worker fixture executed"; navigator.serviceWorker?.register("/sw.js").catch(() => {});</script>');
          case "/sw.js":
            return new Response(`self.addEventListener("install", e => e.waitUntil(fetch("${excludedURL}/worker")));`, {
              headers: { "content-type": "application/javascript" },
            });
          case "/service": return page('<script src="/service.js"></script>');
          case "/service.js": return serviceFailure();
          case "/downgrade": return Response.redirect(`${localURL}/downgraded`);
          default: return new Response("not found", { status: 404 });
        }
      },
    });
    servers.push(deployment);
    const deploymentURL = `https://127.0.0.1:${deployment.port}`;

    return { localURL, deploymentURL, excludedURL, caFile: join(directory, "ca.pem"), visits, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
