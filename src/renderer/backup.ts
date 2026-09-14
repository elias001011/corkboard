import { chooseDialog, confirmDialog } from "./modal";
import { saveBlob } from "./save";
import { store } from "./store";
import { uid, type BoardNode, type Case, type Drawing, type Edge, type Photo } from "./types";

const BACKUP_VERSION = 1;
const backupInput = document.getElementById("backup-input") as HTMLInputElement;

interface PhotoJson extends Omit<Photo, "blob"> {
  type: string;
  data: string;
}
interface Backup {
  app: "corkboard";
  version: number;
  exportedAt: number;
  cases: Case[];
  nodes: BoardNode[];
  edges: Edge[];
  drawings: Drawing[];
  photos: PhotoJson[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "image/png" });
}

export async function exportBackup() {
  const [cases, nodes, edges, drawings, photos] = await Promise.all([
    store.getAll<Case>("cases"),
    store.getAll<BoardNode>("nodes"),
    store.getAll<Edge>("edges"),
    store.getAll<Drawing>("drawings"),
    store.getAll<Photo>("photos"),
  ]);
  const photosJson: PhotoJson[] = [];
  for (const p of photos) {
    const { blob, thumb: _thumb, ...rest } = p; // miniatura é regenerada ao carregar
    photosJson.push({ ...rest, type: blob.type, data: await blobToBase64(blob) });
  }
  const backup: Backup = { app: "corkboard", version: BACKUP_VERSION, exportedAt: Date.now(), cases, nodes, edges, drawings, photos: photosJson };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  await saveBlob(blob, `corkboard-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`, [{ name: "JSON", extensions: ["json"] }]);
}

function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    backupInput.value = "";
    backupInput.onchange = () => resolve(backupInput.files?.[0] ?? null);
    backupInput.oncancel = () => resolve(null);
    backupInput.click();
  });
}

function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return !!b && b.app === "corkboard" && typeof b.version === "number" && Array.isArray(b.cases) && Array.isArray(b.nodes);
}

function remapIds(b: Backup) {
  const map = new Map<string, string>();
  const re = (id: string) => {
    if (!map.has(id)) map.set(id, uid());
    return map.get(id)!;
  };
  for (const c of b.cases) c.id = re(c.id);
  for (const p of b.photos) p.id = re(p.id);
  for (const n of b.nodes) {
    n.id = re(n.id);
    n.caseId = re(n.caseId);
    n.photoIds = n.photoIds.map(re);
    for (const a of n.annotations) a.id = re(a.id);
  }
  for (const e of b.edges) {
    e.id = re(e.id);
    e.caseId = re(e.caseId);
    e.from = re(e.from);
    e.to = re(e.to);
  }
  for (const d of b.drawings) {
    d.id = re(d.id);
    d.caseId = re(d.caseId);
  }
}

export async function importBackup(): Promise<boolean> {
  const file = await pickBackupFile();
  if (!file) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    await confirmDialog("Arquivo inválido", "Não consegui ler esse arquivo como JSON.", "OK");
    return false;
  }
  if (!isBackup(parsed)) {
    await confirmDialog("Arquivo inválido", "Esse arquivo não é um backup do Corkboard.", "OK");
    return false;
  }
  const b = parsed;
  const nPhotos = b.photos?.length ?? 0;
  const mode = await chooseDialog(
    "Importar backup",
    `${b.cases.length} caso(s), ${b.nodes.length} quadro(s), ${nPhotos} foto(s). Como importar?`,
    [
      { label: "Adicionar como novos", value: "merge", primary: true },
      { label: "Substituir tudo", value: "replace" },
    ],
  );
  if (!mode) return false;
  if (mode === "replace") {
    if (!(await confirmDialog("Substituir tudo?", "Todos os casos atuais serão apagados e trocados pelo backup. Não dá para desfazer.", "Substituir"))) return false;
    await store.clearAll();
  } else {
    remapIds(b);
    for (const c of b.cases) c.name = `${c.name} (importado)`;
  }
  for (const c of b.cases) await store.put("cases", c);
  for (const n of b.nodes) await store.put("nodes", n);
  for (const e of b.edges ?? []) await store.put("edges", e);
  for (const d of b.drawings ?? []) await store.put("drawings", d);
  for (const p of b.photos ?? []) {
    const { data, type, ...rest } = p;
    await store.put("photos", { ...rest, blob: base64ToBlob(data, type) } satisfies Photo);
  }
  return true;
}
