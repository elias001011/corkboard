import { confirmDialog } from "./modal";
import { state } from "./state";
import { uid, type BoardNode, type Photo } from "./types";

export const MAX_PHOTOS_PER_NODE = 100;
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
export const THUMB_MAX = 400;

/** Miniatura JPEG ≤ THUMB_MAX px. Decodifica já redimensionando, sem inflar o original na RAM. */
export async function makeThumb(blob: Blob, w: number, h: number): Promise<Blob | null> {
  try {
    const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
    const bmp = await createImageBitmap(blob, { resizeWidth: tw, resizeHeight: th, resizeQuality: "medium" });
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

// Fotos antigas (sem miniatura) ganham uma aos poucos, uma por vez, para não travar a UI.
const thumbQueue: string[] = [];
let thumbBusy = false;
async function drainThumbQueue() {
  if (thumbBusy) return;
  thumbBusy = true;
  while (thumbQueue.length) {
    const id = thumbQueue.shift()!;
    const p = state.photos.get(id);
    if (!p || p.thumb) continue;
    const t = await makeThumb(p.blob, p.w, p.h);
    if (t) state.setThumb(p, t);
    await new Promise((r) => setTimeout(r, 0));
  }
  thumbBusy = false;
}

export function initPhotos() {
  state.on("thumb-missing", (id) => {
    if (!thumbQueue.includes(id as string)) thumbQueue.push(id as string);
    drainThumbQueue();
  });
}

const fileInput = document.getElementById("file-input") as HTMLInputElement;

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const done = (w: number, h: number) => {
      URL.revokeObjectURL(url);
      resolve({ w, h });
    };
    img.onload = () => done(img.naturalWidth, img.naturalHeight);
    img.onerror = () => done(0, 0);
    img.src = url;
  });
}

export async function blobToPhoto(blob: Blob, name: string): Promise<Photo | null> {
  const { w, h } = await imageSize(blob);
  if (!w || !h) return null;
  const thumb = (await makeThumb(blob, w, h)) ?? undefined;
  return { id: uid(), blob, thumb, name, w, h, createdAt: Date.now(), marks: [] };
}

function describe(f: File | Blob): string {
  return f instanceof File ? f.name : "imagem colada";
}

/**
 * Adiciona imagens ao quadro. Recusa (e avisa) o que não for imagem decodificável
 * pelo Chromium (HEIC, TIFF, RAW…), arquivos enormes e o que passar do limite.
 */
export async function addPhotosToNode(node: BoardNode, files: Iterable<File | Blob>): Promise<number> {
  let count = 0;
  const rejected: string[] = [];
  for (const f of files) {
    if (node.photoIds.length >= MAX_PHOTOS_PER_NODE) {
      rejected.push(`${describe(f)} — limite de ${MAX_PHOTOS_PER_NODE} fotos por quadro`);
      continue;
    }
    if (!f.type.startsWith("image/")) {
      rejected.push(`${describe(f)} — não é imagem (${f.type || "tipo desconhecido"})`);
      continue;
    }
    if (f.size > MAX_PHOTO_BYTES) {
      rejected.push(`${describe(f)} — maior que 40 MB`);
      continue;
    }
    const name = f instanceof File ? f.name : `colado-${new Date().toLocaleString("pt-BR").replace(/[/:, ]+/g, "-")}.png`;
    const p = await blobToPhoto(f, name);
    if (!p) {
      rejected.push(`${describe(f)} — formato não suportado (${f.type})`);
      continue;
    }
    state.savePhoto(p);
    node.photoIds.push(p.id);
    count++;
  }
  if (count) state.saveNode(node);
  if (rejected.length) {
    const list = rejected.slice(0, 8).join("\n") + (rejected.length > 8 ? `\n… e mais ${rejected.length - 8}` : "");
    await confirmDialog(count ? `${count} adicionada(s), ${rejected.length} recusada(s)` : "Nenhuma imagem adicionada", list, "OK");
  }
  return count;
}

export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    fileInput.value = "";
    fileInput.onchange = () => resolve([...(fileInput.files ?? [])]);
    fileInput.oncancel = () => resolve([]);
    fileInput.click();
  });
}

export function imagesFromClipboard(e: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}
