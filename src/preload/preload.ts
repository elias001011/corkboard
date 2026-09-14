import { contextBridge, ipcRenderer } from "electron";

export interface SaveFilter {
  name: string;
  extensions: string[];
}

contextBridge.exposeInMainWorld("corkboard", {
  /** Abre "Salvar como" nativo e grava os bytes. Retorna o caminho salvo ou null se cancelado. */
  saveFile: (suggestedName: string, data: ArrayBuffer, filters?: SaveFilter[]): Promise<string | null> =>
    ipcRenderer.invoke("corkboard:save-file", suggestedName, data, filters ?? []),
});
