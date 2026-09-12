// Rasteriza build/icon.svg -> build/icon.png usando o próprio Electron (sem dependências extras).
// Uso: npx electron scripts/icon.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "..", "build", "icon.svg"), "utf8");
  const win = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, "..", "build", "icon.png"), img.toPNG());
  console.log("build/icon.png ok");
  app.quit();
});
