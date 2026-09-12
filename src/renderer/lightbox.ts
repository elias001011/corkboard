import { attachDrawSurface, drawingToSvg } from "./drawings";
import { confirmDialog, promptText } from "./modal";
import { showMenu } from "./contextmenu";
import { state } from "./state";
import type { DrawTool, Photo } from "./types";

const SVG = "http://www.w3.org/2000/svg";
const lb = document.getElementById("lightbox") as HTMLDivElement;

let nodeId = "";
let index = 0;
let tool: DrawTool | null = null;
let frame!: HTMLDivElement;
let img!: HTMLImageElement;
let svg!: SVGSVGElement;
let stage!: HTMLDivElement;
let nameEl!: HTMLSpanElement;
let dateBtn!: HTMLButtonElement;
let counter!: HTMLDivElement;
let toolBtns: HTMLButtonElement[] = [];
const fit = { x: 0, y: 0, scale: 1 };

function photoIds(): string[] {
  return state.nodes.get(nodeId)?.photoIds ?? [];
}
function current(): Photo | undefined {
  return state.photos.get(photoIds()[index]);
}

function buildOnce() {
  if (frame) return;
  lb.innerHTML = `
    <div class="lb-top">
      <span class="name"></span>
      <button data-tool="ellipse" title="Circular (C)">◯ Círculo</button>
      <button data-tool="arrow" title="Seta (S)">➜ Seta</button>
      <button data-tool="pen" title="Caneta (P)">✎ Caneta</button>
      <button data-tool="rect" title="Retângulo (R)">▭ Retângulo</button>
      <button class="undo" title="Desfazer última marca (Ctrl+Z)">↶ Desfazer</button>
      <button class="date" title="Data da foto"></button>
      <button class="del danger" title="Remover esta foto do quadro">Remover</button>
      <button class="close" title="Fechar (Esc)">✕</button>
    </div>
    <div class="lb-stage">
      <div class="lb-frame"><img draggable="false"><svg></svg></div>
      <button class="nav prev">‹</button>
      <button class="nav next">›</button>
      <div class="counter"></div>
    </div>`;
  stage = lb.querySelector(".lb-stage")!;
  frame = lb.querySelector(".lb-frame")!;
  img = lb.querySelector("img")!;
  svg = lb.querySelector("svg")!;
  nameEl = lb.querySelector(".name")!;
  dateBtn = lb.querySelector(".date")!;
  counter = lb.querySelector(".counter")!;
  toolBtns = [...lb.querySelectorAll<HTMLButtonElement>("[data-tool]")];
  for (const b of toolBtns) b.onclick = () => setTool(tool === b.dataset.tool ? null : (b.dataset.tool as DrawTool));
  lb.querySelector<HTMLButtonElement>(".close")!.onclick = close;
  lb.querySelector<HTMLButtonElement>(".prev")!.onclick = () => go(-1);
  lb.querySelector<HTMLButtonElement>(".next")!.onclick = () => go(1);
  lb.querySelector<HTMLButtonElement>(".undo")!.onclick = undo;
  lb.querySelector<HTMLButtonElement>(".del")!.onclick = removeCurrent;
  dateBtn.onclick = async () => {
    const p = current();
    if (!p) return;
    const v = await promptText("Data da foto (livre)", p.takenAt ?? "", "ex: 14/03/2021, mar/2019, 2020");
    if (v === null) return;
    p.takenAt = v || undefined;
    state.savePhoto(p);
    show();
  };

  let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (tool || e.button === 2) return;
    panning = { sx: e.clientX, sy: e.clientY, ox: fit.x, oy: fit.y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!panning) return;
    fit.x = panning.ox + e.clientX - panning.sx;
    fit.y = panning.oy + e.clientY - panning.sy;
    applyFit();
  });
  stage.addEventListener("pointerup", () => (panning = null));
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const ns = Math.min(10, Math.max(0.05, fit.scale * f));
    fit.x = mx - ((mx - fit.x) * ns) / fit.scale;
    fit.y = my - ((my - fit.y) * ns) / fit.scale;
    fit.scale = ns;
    applyFit();
  }, { passive: false });

  attachDrawSurface({
    svg,
    hostEl: stage,
    toLocal: (cx, cy) => {
      const r = stage.getBoundingClientRect();
      return { x: (cx - r.left - fit.x) / fit.scale, y: (cy - r.top - fit.y) / fit.scale };
    },
    getTool: () => tool,
    getColor: () => state.drawColor,
    getWidth: () => Math.max(2, Math.round((current()?.w ?? 1000) / 250)),
    onCommit: (d) => {
      const p = current();
      if (!p) return;
      p.marks.push(d);
      state.savePhoto(p);
      renderMarks();
    },
  });

  svg.addEventListener("contextmenu", (e) => {
    const t = e.target as SVGElement;
    const id = t.dataset.mark;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, [
      { label: "Excluir marca", danger: true, action: () => {
        const p = current();
        if (!p) return;
        p.marks = p.marks.filter((m) => m.id !== id);
        state.savePhoto(p);
        renderMarks();
      } },
    ]);
  });
}

function setTool(t: DrawTool | null) {
  tool = t;
  stage.classList.toggle("tool", !!t);
  svg.style.pointerEvents = t ? "none" : "";
  for (const b of toolBtns) b.classList.toggle("active", b.dataset.tool === t);
}

function applyFit() {
  frame.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
}

function fitToStage() {
  const p = current();
  if (!p) return;
  const r = stage.getBoundingClientRect();
  const s = Math.min(1, (r.width - 40) / p.w, (r.height - 40) / p.h);
  fit.scale = s > 0 ? s : 1;
  fit.x = (r.width - p.w * fit.scale) / 2;
  fit.y = (r.height - p.h * fit.scale) / 2;
  applyFit();
}

function renderMarks() {
  const p = current();
  svg.replaceChildren();
  if (!p) return;
  svg.setAttribute("width", String(p.w));
  svg.setAttribute("height", String(p.h));
  for (const m of p.marks) {
    const el = drawingToSvg(m);
    el.dataset.mark = m.id;
    el.style.pointerEvents = "stroke";
    svg.append(el);
  }
}

function show() {
  const p = current();
  const ids = photoIds();
  if (!p) {
    close();
    return;
  }
  img.src = state.photoUrl(p.id);
  img.width = p.w;
  img.height = p.h;
  nameEl.textContent = p.name;
  dateBtn.textContent = p.takenAt ? `📅 ${p.takenAt}` : "📅 data da foto";
  counter.textContent = `${index + 1} / ${ids.length}`;
  renderMarks();
  fitToStage();
}

function go(delta: number) {
  const n = photoIds().length;
  if (!n) return;
  index = (index + delta + n) % n;
  show();
}

function undo() {
  const p = current();
  if (!p || !p.marks.length) return;
  p.marks.pop();
  state.savePhoto(p);
  renderMarks();
}

async function removeCurrent() {
  const node = state.nodes.get(nodeId);
  const p = current();
  if (!node || !p) return;
  if (!(await confirmDialog("Remover foto", `Remover "${p.name}" deste quadro? Isso apaga a foto e suas marcas.`))) return;
  node.photoIds = node.photoIds.filter((id) => id !== p.id);
  state.saveNode(node);
  if (index >= node.photoIds.length) index = Math.max(0, node.photoIds.length - 1);
  if (node.photoIds.length === 0) close();
  else show();
}

function onKey(e: KeyboardEvent) {
  if (lb.hidden) return;
  if (document.activeElement?.tagName === "INPUT") return;
  e.stopPropagation();
  switch (e.key) {
    case "Escape": tool ? setTool(null) : close(); break;
    case "ArrowLeft": go(-1); break;
    case "ArrowRight": go(1); break;
    case "c": case "C": setTool(tool === "ellipse" ? null : "ellipse"); break;
    case "s": case "S": setTool(tool === "arrow" ? null : "arrow"); break;
    case "p": case "P": setTool(tool === "pen" ? null : "pen"); break;
    case "r": case "R": setTool(tool === "rect" ? null : "rect"); break;
    case "0": fitToStage(); break;
    case "z": case "Z": if (e.ctrlKey) undo(); break;
  }
}

export function openLightbox(nId: string, i: number) {
  buildOnce();
  nodeId = nId;
  index = i;
  setTool(null);
  lb.hidden = false;
  show();
}

export function close() {
  lb.hidden = true;
  setTool(null);
}

export function initLightbox() {
  state.on("open-lightbox", (p) => {
    const { nodeId, index } = p as { nodeId: string; index: number };
    openLightbox(nodeId, index);
  });
  window.addEventListener("keydown", onKey, true);
}
