import { state } from "./state";
import { uid, type BoardNode, type Photo } from "./types";

const fileInput = document.getElementById("file-input") as HTMLInputElement;

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ w: 0, h: 0 });
    };
    img.src = url;
  });
}

export async function blobToPhoto(blob: Blob, name: string): Promise<Photo> {
  const { w, h } = await imageSize(blob);
  return { id: uid(), blob, name, w, h, createdAt: Date.now(), marks: [] };
}

export async function addPhotosToNode(node: BoardNode, files: Iterable<File | Blob>): Promise<number> {
  let count = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const name = f instanceof File ? f.name : `colado-${new Date().toLocaleString("pt-BR")}.png`;
    const p = await blobToPhoto(f, name);
    state.savePhoto(p);
    node.photoIds.push(p.id);
    count++;
  }
  if (count) state.saveNode(node);
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
