interface CorkboardBridge {
  saveFile(suggestedName: string, data: ArrayBuffer, filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
}

interface Window {
  corkboard?: CorkboardBridge;
}
