import { toWorld, viewportEl } from "./canvas";
import { state } from "./state";
import { uid, type BoardNode, type Edge } from "./types";

const SVG = "http://www.w3.org/2000/svg";
const underEl = document.getElementById("under") as unknown as SVGSVGElement;
const overEl = document.getElementById("over") as unknown as SVGSVGElement;
const groups = new Map<string, SVGGElement>();
let defsDone = false;

function ensureDefs() {
  if (defsDone) return;
  defsDone = true;
  const defs = document.createElementNS(SVG, "defs");
  defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker>`;
  underEl.prepend(defs);
}

function anchor(n: BoardNode, towards: { x: number; y: number }) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (Math.abs(dx) * n.h > Math.abs(dy) * n.w) {
    return dx > 0 ? { x: n.x + n.w, y: cy, side: "r" } : { x: n.x, y: cy, side: "l" };
  }
  return dy > 0 ? { x: cx, y: n.y + n.h, side: "b" } : { x: cx, y: n.y, side: "t" };
}

export function edgePath(a: BoardNode, b: BoardNode): { d: string; mid: { x: number; y: number } } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p1 = anchor(a, cb), p2 = anchor(b, ca);
  const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.35);
  const off = (s: string) => (s === "r" ? { x: k, y: 0 } : s === "l" ? { x: -k, y: 0 } : s === "b" ? { x: 0, y: k } : { x: 0, y: -k });
  const o1 = off(p1.side), o2 = off(p2.side);
  const c1 = { x: p1.x + o1.x, y: p1.y + o1.y }, c2 = { x: p2.x + o2.x, y: p2.y + o2.y };
  const mid = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  };
  return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid };
}

export function renderEdge(id: string) {
  ensureDefs();
  const e = state.edges.get(id);
  if (!e) return;
  const a = state.nodes.get(e.from), b = state.nodes.get(e.to);
  if (!a || !b) return;
  let g = groups.get(id);
  if (!g) {
    g = document.createElementNS(SVG, "g");
    g.innerHTML = `<path class="edge-hit"/><path class="edge" marker-end="url(#arrow)"/><rect class="edge-label-bg" rx="3"/><text class="edge-label" text-anchor="middle"/>`;
    underEl.append(g);
    groups.set(id, g);
    const open = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      state.select({ kind: "edge", id });
      state.emit("ctx", { kind: "edge", id, x: ev.clientX, y: ev.clientY });
    };
    g.addEventListener("contextmenu", open);
    g.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      state.select({ kind: "edge", id });
    });
  }
  const { d, mid } = edgePath(a, b);
  const [hit, path, bg, text] = [...g.children] as [SVGPathElement, SVGPathElement, SVGRectElement, SVGTextElement];
  hit.setAttribute("d", d);
  path.setAttribute("d", d);
  path.style.stroke = e.color ?? "";
  path.classList.toggle("selected", state.selection?.kind === "edge" && state.selection.id === id);
  if (e.label) {
    text.textContent = e.label;
    text.setAttribute("x", String(mid.x));
    text.setAttribute("y", String(mid.y + 4));
    const w = e.label.length * 7 + 12;
    bg.setAttribute("x", String(mid.x - w / 2));
    bg.setAttribute("y", String(mid.y - 9));
    bg.setAttribute("width", String(w));
    bg.setAttribute("height", "18");
    bg.style.display = text.style.display = "";
  } else {
    bg.style.display = text.style.display = "none";
  }
}

export function renderAllEdges() {
  for (const g of groups.values()) g.remove();
  groups.clear();
  for (const id of state.edges.keys()) renderEdge(id);
}

export function edgesOf(nodeId: string): Edge[] {
  return [...state.edges.values()].filter((e) => e.from === nodeId || e.to === nodeId);
}

let rubber: SVGPathElement | null = null;

export function startLink(fromId: string) {
  state.setTool({ kind: "link", from: fromId });
  rubber = document.createElementNS(SVG, "path");
  rubber.setAttribute("class", "rubber");
  overEl.append(rubber);
  const move = (ev: PointerEvent) => {
    const from = state.nodes.get(fromId);
    if (!from || !rubber) return;
    const p = toWorld(ev.clientX, ev.clientY);
    const a = anchor(from, p);
    rubber.setAttribute("d", `M${a.x},${a.y} L${p.x},${p.y}`);
  };
  viewportEl.addEventListener("pointermove", move);
  const cleanup = () => {
    viewportEl.removeEventListener("pointermove", move);
    state.off("link-target", onTarget);
    state.off("tool-cancel", cleanup);
    rubber?.remove();
    rubber = null;
    state.setTool({ kind: "select" });
  };
  const onTarget = (toId: unknown) => {
    if (typeof toId === "string" && toId !== fromId) {
      const exists = [...state.edges.values()].some((e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId));
      if (!exists) state.saveEdge({ id: uid(), caseId: state.currentCase!.id, from: fromId, to: toId });
    }
    cleanup();
  };
  state.on("link-target", onTarget);
  state.on("tool-cancel", cleanup);
}

export function initEdges() {
  state.on("case-loaded", renderAllEdges);
  state.on("edge", (id) => renderEdge(id as string));
  state.on("edge-removed", (id) => {
    groups.get(id as string)?.remove();
    groups.delete(id as string);
  });
  const refresh = (id: unknown) => edgesOf(id as string).forEach((e) => renderEdge(e.id));
  state.on("node-moved", refresh);
  state.on("node", refresh);
  state.on("selection", () => {
    for (const [id, g] of groups) g.querySelector(".edge")!.classList.toggle("selected", state.selection?.kind === "edge" && state.selection.id === id);
  });
}
