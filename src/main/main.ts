import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import fs from "node:fs";
import path from "node:path";

const prefsPath = () => path.join(app.getPath("userData"), "main-prefs.json");

function readPrefs(): { lastSaveDir?: string } {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writePrefs(p: { lastSaveDir?: string }) {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(p));
  } catch {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "Corkboard",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // No macOS, Cmd+C/V/Z só funcionam se existir um menu com esses papéis.
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  let dest = path.join(dir, name);
  for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${base} (${i})${ext}`);
  return dest;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const allowed = details.url.startsWith("file://") || details.url.startsWith("blob:") || details.url.startsWith("data:") || details.url.startsWith("devtools://");
    cb({ cancel: !allowed });
  });

  // Caminho principal de exportação: o renderer manda os bytes, o main abre
  // "Salvar como" (lembrando a última pasta) e grava. Não passa pelo fluxo de
  // download do Chromium, que bloqueia downloads repetidos sem gesto "fresco".
  ipcMain.handle("corkboard:save-file", async (event, suggestedName: unknown, data: unknown, filters: unknown) => {
    if (typeof suggestedName !== "string" || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return null;
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const prefs = readPrefs();
    const dir = prefs.lastSaveDir && fs.existsSync(prefs.lastSaveDir) ? prefs.lastSaveDir : app.getPath("downloads");
    const safeName = path.basename(suggestedName).replace(/[\\/:*?"<>|]/g, "_");
    const r = await dialog.showSaveDialog(win!, {
      title: "Salvar exportação",
      defaultPath: uniquePath(dir, safeName),
      filters: Array.isArray(filters) && filters.length ? (filters as Electron.FileFilter[]) : undefined,
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (r.canceled || !r.filePath) return null;
    const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
    await fs.promises.writeFile(r.filePath, bytes);
    writePrefs({ ...prefs, lastSaveDir: path.dirname(r.filePath) });
    return r.filePath;
  });

  // Fallback (renderer sem preload, ex.: versão web/Android futura): salva direto em ~/Downloads.
  session.defaultSession.on("will-download", (_event, item) => {
    item.setSavePath(uniquePath(app.getPath("downloads"), item.getFilename()));
  });

  createWindow();
});

app.on("window-all-closed", () => app.quit());
