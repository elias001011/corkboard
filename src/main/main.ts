import { app, BrowserWindow, Menu, session } from "electron";
import path from "node:path";

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const allowed = details.url.startsWith("file://") || details.url.startsWith("blob:") || details.url.startsWith("data:") || details.url.startsWith("devtools://");
    cb({ cancel: !allowed });
  });
  // Sem este handler, o Chromium usa sua heurística padrão pra downloads
  // automáticos (sem diálogo) e bloqueia silenciosamente a partir do 2º
  // download da mesma página. Assumindo o download aqui, sempre funciona.
  session.defaultSession.on("will-download", (_event, item) => {
    const dir = app.getPath("downloads");
    let name = item.getFilename();
    let dest = path.join(dir, name);
    const ext = path.extname(name);
    const base = ext ? name.slice(0, -ext.length) : name;
    for (let i = 1; require("node:fs").existsSync(dest); i++) dest = path.join(dir, `${base} (${i})${ext}`);
    item.setSavePath(dest);
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
