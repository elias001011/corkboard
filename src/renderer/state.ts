import type { BoardNode, Case, Drawing, DrawTool, Edge, Photo } from "./types";
import { saveDebounced, store } from "./store";

export type Tool = { kind: "select" } | { kind: "draw"; tool: DrawTool } | { kind: "link"; from: string };

export type Selection = { kind: "node" | "edge" | "drawing"; id: string } | null;

class State {
  currentCase: Case | null = null;
  nodes = new Map<string, BoardNode>();
  edges = new Map<string, Edge>();
  drawings = new Map<string, Drawing>();
  photos = new Map<string, Photo>();
  photoUrls = new Map<string, string>();
  tool: Tool = { kind: "select" };
  selection: Selection = null;
  drawColor = "#e05a4a";

  private listeners = new Map<string, Set<(payload?: unknown) => void>>();

  on(evt: string, fn: (payload?: unknown) => void) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt)!.add(fn);
  }
  off(evt: string, fn: (payload?: unknown) => void) {
    this.listeners.get(evt)?.delete(fn);
  }
  emit(evt: string, payload?: unknown) {
    [...(this.listeners.get(evt) ?? [])].forEach((fn) => fn(payload));
  }

  async loadCase(c: Case) {
    this.currentCase = c;
    this.nodes.clear();
    this.edges.clear();
    this.drawings.clear();
    this.selection = null;
    this.tool = { kind: "select" };
    const [nodes, edges, drawings] = await Promise.all([
      store.byCase<BoardNode>("nodes", c.id),
      store.byCase<Edge>("edges", c.id),
      store.byCase<Drawing>("drawings", c.id),
    ]);
    nodes.forEach((n) => this.nodes.set(n.id, n));
    edges.forEach((e) => this.edges.set(e.id, e));
    drawings.forEach((d) => this.drawings.set(d.id, d));
    const photoIds = nodes.flatMap((n) => n.photoIds);
    await Promise.all(photoIds.map((id) => this.ensurePhoto(id)));
    this.emit("case-loaded");
  }

  async ensurePhoto(id: string): Promise<Photo | undefined> {
    if (this.photos.has(id)) return this.photos.get(id);
    const p = await store.get<Photo>("photos", id);
    if (p) this.cachePhoto(p);
    return p;
  }

  cachePhoto(p: Photo) {
    this.photos.set(p.id, p);
    if (!this.photoUrls.has(p.id)) this.photoUrls.set(p.id, URL.createObjectURL(p.blob));
  }

  photoUrl(id: string): string {
    return this.photoUrls.get(id) ?? "";
  }

  touchCase() {
    if (!this.currentCase) return;
    this.currentCase.updatedAt = Date.now();
    saveDebounced("cases", this.currentCase, 1000);
  }

  saveNode(n: BoardNode) {
    this.nodes.set(n.id, n);
    saveDebounced("nodes", n);
    this.touchCase();
    this.emit("node", n.id);
  }
  removeNode(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodes.delete(id);
    store.del("nodes", id);
    for (const pid of n.photoIds) this.removePhoto(pid);
    for (const e of [...this.edges.values()]) if (e.from === id || e.to === id) this.removeEdge(e.id);
    if (this.selection?.id === id) this.selection = null;
    this.touchCase();
    this.emit("node-removed", id);
  }

  saveEdge(e: Edge) {
    this.edges.set(e.id, e);
    saveDebounced("edges", e);
    this.touchCase();
    this.emit("edge", e.id);
  }
  removeEdge(id: string) {
    this.edges.delete(id);
    store.del("edges", id);
    if (this.selection?.id === id) this.selection = null;
    this.touchCase();
    this.emit("edge-removed", id);
  }

  saveDrawing(d: Drawing) {
    this.drawings.set(d.id, d);
    saveDebounced("drawings", d);
    this.touchCase();
    this.emit("drawing", d.id);
  }
  removeDrawing(id: string) {
    this.drawings.delete(id);
    store.del("drawings", id);
    if (this.selection?.id === id) this.selection = null;
    this.touchCase();
    this.emit("drawing-removed", id);
  }

  savePhoto(p: Photo) {
    this.cachePhoto(p);
    store.put("photos", p);
  }
  removePhoto(id: string) {
    const url = this.photoUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.photoUrls.delete(id);
    this.photos.delete(id);
    store.del("photos", id);
  }

  setTool(t: Tool) {
    this.tool = t;
    this.emit("tool");
  }
  select(s: Selection) {
    this.selection = s;
    this.emit("selection");
  }

  nextZ(): number {
    let z = 0;
    for (const n of this.nodes.values()) z = Math.max(z, n.z);
    return z + 1;
  }
}

export const state = new State();
