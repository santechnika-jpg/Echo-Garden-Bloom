import { readFileSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "404.html",
  "reset.html",
  "styles.css",
  "game.js",
  "manifest.webmanifest",
  "service-worker.js",
  "project-manifest.yaml",
  "icons/echo-garden-icon.svg",
  "icons/echo-garden-maskable.svg"
];

for (const file of requiredFiles) {
  readFileSync(file, "utf8");
}

const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error("manifest.webmanifest must declare at least two icons");
}

for (const icon of manifest.icons) {
  if (!icon.src || icon.src.startsWith("data:")) {
    throw new Error("manifest icons must use project-owned icon files");
  }
}

const serviceWorker = readFileSync("service-worker.js", "utf8");
for (const file of ["./index.html", "./styles.css?v=11", "./game.js?v=11", "./manifest.webmanifest"]) {
  if (!serviceWorker.includes(file)) {
    throw new Error(`service-worker.js cache list is missing ${file}`);
  }
}

const html = readFileSync("index.html", "utf8");
const notFoundHtml = readFileSync("404.html", "utf8");
const resetHtml = readFileSync("reset.html", "utf8");
for (const id of ["motionToggle", "contrastToggle", "modeClassic", "modeZen", "modeDaily", "modePractice", "streakValue", "bloomText", "modeSummary"]) {
  if (!html.includes(`id="${id}"`)) {
    throw new Error(`index.html is missing #${id}`);
  }
}

for (const script of ["game.js"]) {
  const source = readFileSync(script, "utf8");
  if (source.includes("\uFFFD") || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(source)) {
    throw new Error(`${script} appears to contain invalid text or control characters`);
  }
}

const game = readFileSync("game.js", "utf8");
if (game.includes("masterGaion")) {
  throw new Error("game.js contains unexpected text: masterGaion");
}

if (!html.includes("styles.css?v=11") || !html.includes("game.js?v=11")) {
  throw new Error("index.html must load the v11 app shell assets");
}

for (const retired of ["mobile-polish.css", "no-rings-v8.css", "audio-boost.js", "sequence-clarity-v10.js"]) {
  if (html.includes(retired) || serviceWorker.includes(retired)) {
    throw new Error(`${retired} must not be loaded by the app shell`);
  }
}

if (game.includes("window.setTimeout =") || game.includes("AudioContext.prototype.createGain")) {
  throw new Error("game.js must not use global runtime monkey-patches");
}

if (!serviceWorker.includes("echo-garden-v11")) {
  throw new Error("service-worker.js cache version must be echo-garden-v11");
}

const css = readFileSync("styles.css", "utf8");
for (const required of [".version-badge", ".settings-panel", ".bloom-meter", "plantArtworkFlash", ".plant.active .plant-shape"]) {
  if (!css.includes(required)) {
    throw new Error(`styles.css is missing required UI behavior: ${required}`);
  }
}

for (const required of ["timings", "streak", "updateBloom", "getSuccessMessage", "CACHE_SOUND_KEY"]) {
  if (!game.includes(required)) {
    throw new Error(`game.js is missing required v11 behavior: ${required}`);
  }
}

if (!html.includes(">v11<")) {
  throw new Error("index.html must display the current version badge");
}

if (html.includes('class="ripple"') || html.includes('class="trail"')) {
  throw new Error("index.html must not include detached light-ring elements");
}

for (const required of ["getRegistrations", "caches.keys", "./?v=11&reset=1"]) {
  if (!resetHtml.includes(required)) {
    throw new Error(`reset.html is missing reset behavior: ${required}`);
  }
  if (!notFoundHtml.includes(required)) {
    throw new Error(`404.html is missing reset behavior: ${required}`);
  }
}

console.log("Static validation passed.");
