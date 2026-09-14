import { toast } from "./modal";

/** Salva um Blob: via diálogo nativo (Electron) ou, sem bridge, como download comum. */
export async function saveBlob(blob: Blob, suggestedName: string, filters?: { name: string; extensions: string[] }[]): Promise<boolean> {
  if (window.corkboard?.saveFile) {
    const path = await window.corkboard.saveFile(suggestedName, await blob.arrayBuffer(), filters);
    if (path) toast(`Salvo em ${path}`);
    return !!path;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Baixado: ${suggestedName}`);
  return true;
}
