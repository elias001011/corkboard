import type { BoardNode, Case, Drawing, DrawTool, Edge, Photo } from "./types";
import { saveDebounced, store } from "./store";

export type Tool = { kind: "select" } | { kind: "draw"; tool: DrawTool } | { kind: "link"; from: string };

export type Selection = { kind: "node" | "edge" | "drawing"; id: string } | null;

interface Snapshot {
  nodes: BoardNode[];
  edges: Edge[];
  drawings: Drawing[];
}

const HISTORY_MAX = 200;

class State {
  currentCase: Case | null = null;
  nodes = new Map<string, BoardNode>();
  edges = new Map<string, Edge>();
  drawings = new Map<string, Drawing>();
  photos = new Map<string, Photo>();
  photoUrls = new Map<string, string>();
  /** Caixas (coords do mundo) das anotações subjetivas renderizadas — usadas pelas ligações. */
  annotBoxes = new Map<string, { x: number; y: number; w: number; h: number; nodeId: string }>();
  tool: Tool = { kind: "select" };
  selection: Selection = null;
  drawColor = "#e05a4a";

  private history: Snapshot[] = [];
  private future: Snapshot[] = [];
  private baseline: Snapshot = { nodes: [], edges: [], drawings: [] };
  private lastCommit = { key: "", at: 0 };

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
    this.history = [];
    this.future = [];
    this.emit("history");
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
    this.baseline = this.snapshot();
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

  private snapshot(): Snapshot {
    return structuredClone({ nodes: [...this.nodes.values()], edges: [...this.edges.values()], drawings: [...this.drawings.values()] });
  }

  /** Chamar DEPOIS de aplicar uma mutação. Chamadas seguidas com a mesma chave viram um passo só. */
  private commit(key: string) {
    const now = Date.now();
    if (!(this.lastCommit.key === key && now - this.lastCommit.at < 400)) {
      this.history.push(this.baseline);
      if (this.history.length > HISTORY_MAX) this.history.shift();
      this.future = [];
    }
    this.lastCommit = { key, at: now };
    this.baseline = this.snapshot();
    this.emit("history");
  }

  get canUndo() {
    return this.history.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  undo() {
    const snap = this.history.pop();
    if (!snap) return;
    this.future.push(this.baseline);
    this.apply(snap);
  }

  redo() {
    const snap = this.future.pop();
    if (!snap) return;
    this.history.push(this.baseline);
    this.apply(snap);
  }

  private apply(snap: Snapshot) {
    this.lastCommit = { key: "", at: 0 };
    this.selection = null;
    const s = structuredClone(snap);
    const sync = <T extends { id: string }>(map: Map<string, T>, next: T[], name: "nodes" | "edges" | "drawings", evt: string) => {
      const keep = new Set(next.map((x) => x.id));
      for (const id of [...map.keys()]) {
        if (keep.has(id)) continue;
        map.delete(id);
        store.del(name, id);
        this.emit(`${evt}-removed`, id);
      }
      for (const x of next) {
        map.set(x.id, x);
        store.put(name, x);
      }
      for (const x of next) this.emit(evt, x.id);
    };
    sync(this.nodes, s.nodes, "nodes", "node");
    sync(this.edges, s.edges, "edges", "edge");
    sync(this.drawings, s.drawings, "drawings", "drawing");
    for (const n of s.nodes) {
      const missing = n.photoIds.filter((pid) => !this.photos.has(pid));
      if (missing.length) Promise.all(missing.map((pid) => this.ensurePhoto(pid))).then(() => this.emit("node", n.id));
    }
    this.baseline = snap;
    this.touchCase();
    this.emit("selection");
    this.emit("history");
  }

  saveNode(n: BoardNode) {
    this.nodes.set(n.id, n);
    saveDebounced("nodes", n);
    this.commit(`node:${n.id}`);
    this.touchCase();
    this.emit("node", n.id);
  }
  removeNode(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodes.delete(id);
    store.del("nodes", id);
    const ends = new Set<string>([id, ...n.annotations.map((a) => a.id)]);
    for (const e of [...this.edges.values()]) if (ends.has(e.from) || ends.has(e.to)) this.removeEdge(e.id, true);
    this.commit(`remove:${id}`);
    if (this.selection?.id === id) this.selection = null;
    this.touchCase();
    this.emit("node-removed", id);
  }

  saveEdge(e: Edge) {
    this.edges.set(e.id, e);
    saveDebounced("edges", e);
    this.commit(`edge:${e.id}`);
    this.touchCase();
    this.emit("edge", e.id);
  }
  removeEdge(id: string, silent = false) {
    if (!this.edges.has(id)) return;
    this.edges.delete(id);
    store.del("edges", id);
    if (!silent) this.commit(`remove:${id}`);
    if (this.selection?.id === id) this.selection = null;
    this.touchCase();
    this.emit("edge-removed", id);
  }

  saveDrawing(d: Drawing) {
    this.drawings.set(d.id, d);
    saveDebounced("drawings", d);
    this.commit(`drawing:${d.id}`);
    this.touchCase();
    this.emit("drawing", d.id);
  }
  removeDrawing(id: string) {
    if (!this.drawings.has(id)) return;
    this.drawings.delete(id);
    store.del("drawings", id);
    this.commit(`remove:${id}`);
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
