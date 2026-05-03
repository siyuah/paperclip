#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { buildUiSmokePreviewBrowserHarness } from "../src/ui-smoke-preview-browser-harness.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../../..");
const defaultOutDir = join(repoRoot, "output/dark-factory-bridge-ui-preview");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4178;
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const htmlPath = await writePreview(outDir);

  if (options.once) {
    console.log(JSON.stringify({
      ok: true,
      htmlPath,
      outDir,
      directBrowserUrl: `http://${host}:${port}/`,
    }, null, 2));
    return;
  }

  const server = createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";

    if (url === "/__paperclip__/health") {
      sendJson(res, {
        ok: true,
        directPreview: true,
        htmlPath,
        outDir,
        bundleServerCommand: "pnpm dev:ui:bundle",
      });
      return;
    }

    if (url === "/" || url === "/index.html") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      createReadStream(htmlPath).pipe(res);
      return;
    }

    sendJson(res, { error: "Not found" }, 404);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => resolveListen());
  }).catch((error) => {
    if (error && error.code === "EADDRINUSE") {
      throw new Error(
        `Port ${port} is already in use. Stop the old preview server or run: pnpm dev:ui -- --port <free-port>`,
      );
    }
    throw error;
  });

  console.log(`Dark Factory bridge UI preview listening at http://${host}:${port}/`);
  console.log(`Generated standalone preview: ${htmlPath}`);
  console.log("For Paperclip host bundle serving, use: pnpm dev:ui:bundle");

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function writePreview(outDir) {
  await mkdir(outDir, { recursive: true });
  const htmlPath = join(outDir, "index.html");
  await writeFile(
    htmlPath,
    buildUiSmokePreviewBrowserHarness({
      title: "Dark Factory Bridge WebUI Preview",
      generatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  return htmlPath;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--host") {
      parsed.host = args[index + 1];
      index += 1;
    } else if (arg === "--port") {
      parsed.port = parsePort(args[index + 1]);
      index += 1;
    } else if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
    } else if (arg === "--once") {
      parsed.once = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm dev:ui [--host HOST] [--port PORT] [--out DIR] [--once]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function parsePort(value) {
  const port = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }
  return port;
}

function sendJson(res, value, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
