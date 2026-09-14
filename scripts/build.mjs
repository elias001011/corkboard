import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/renderer", { recursive: true });

await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  outfile: "dist/main.js",
});

await build({
  entryPoints: ["src/preload/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  outfile: "dist/preload.js",
});

await build({
  entryPoints: ["src/renderer/app.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome140",
  outfile: "dist/renderer/app.js",
  minify: process.env.NODE_ENV === "production",
});

cpSync("src/renderer/index.html", "dist/renderer/index.html");
cpSync("src/renderer/styles.css", "dist/renderer/styles.css");
console.log("build ok");
