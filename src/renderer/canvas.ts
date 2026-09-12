import { state } from "./state";
import { saveDebounced } from "./store";

export const viewportEl = document.getElementById("viewport") as HTMLDivElement;
export const worldEl = document.getElementById("world") as HTMLDivElement;

export const view = { x: 0, y: 0, zoom: 1 };

export function applyView() {
  worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  const c = state.currentCase;
  if (c) {
    c.viewport = { ...view };
    saveDebounced("cases", c, 800);
  }
}

export function setView(v: { x: number; y: number; zoom: number }) {
  view.x = v.x;
  view.y = v.y;
  view.zoom = v.zoom;
  applyView();
}

export function toWorld(clientX: number, clientY: number) {
  const r = viewportEl.getBoundingClientRect();
  return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
}

export function centerOnContent() {
  const nodes = [...state.nodes.values()];
  const r = viewportEl.getBoundingClientRect();
  if (nodes.length === 0) {
    setView({ x: r.width / 2, y: r.height / 2, zoom: 1 });
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w + (n.annotations.length ? 240 : 0));
    maxY = Math.max(maxY, n.y + n.h);
  }
  const w = maxX - minX + 120, h = maxY - minY + 120;
  const zoom = Math.min(1.5, Math.max(0.15, Math.min(r.width / w, r.height / h)));
  setView({ x: r.width / 2 - ((minX + maxX) / 2) * zoom, y: r.height / 2 - ((minY + maxY) / 2) * zoom, zoom });
}

export function initCanvas() {
  viewportEl.addEventListener("wheel", (e) => {
    // Rolar dentro de um campo de texto em edição (com barra de rolagem
    // própria) não deve mover/zoomar o quadro inteiro por baixo dele.
    if ((e.target as Element).closest?.("textarea, input")) return;
    e.preventDefault();
    const r = viewportEl.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (e.ctrlKey || !e.shiftKey) {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.min(8, Math.max(0.1, view.zoom * factor));
      view.x = mx - ((mx - view.x) * nz) / view.zoom;
      view.y = my - ((my - view.y) * nz) / view.zoom;
      view.zoom = nz;
    } else {
      view.x -= e.deltaY;
    }
    applyView();
  }, { passive: false });

  let panning: { sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
  viewportEl.addEventListener("pointerdown", (e) => {
    const onEmpty = e.target === viewportEl || e.target === worldEl || (e.target as Element).closest?.(".layer") === e.target;
    const middle = e.button === 1;
    // Com um card em edição, só o botão do meio navega — clique esquerdo
    // perto do texto não deve puxar o quadro embaixo dele.
    const editingNow = document.activeElement?.tagName === "TEXTAREA";
    if (!(middle || (!editingNow && e.button === 0 && onEmpty && state.tool.kind === "select"))) return;
    panning = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    viewportEl.setPointerCapture(e.pointerId);
    viewportEl.classList.add("panning");
  });
  viewportEl.addEventListener("pointermove", (e) => {
    if (!panning) return;
    const dx = e.clientX - panning.sx, dy = e.clientY - panning.sy;
    if (Math.abs(dx) + Math.abs(dy) > 2) panning.moved = true;
    view.x = panning.ox + dx;
    view.y = panning.oy + dy;
    applyView();
  });
  const endPan = (e: PointerEvent) => {
    if (!panning) return;
    if (!panning.moved && e.button === 0) state.select(null);
    panning = null;
    viewportEl.classList.remove("panning");
  };
  viewportEl.addEventListener("pointerup", endPan);
  viewportEl.addEventListener("pointercancel", endPan);
}
