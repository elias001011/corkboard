import { attachDrawSurface, drawingToSvg } from "./drawings";
import { firstTitle } from "./markdown";
import { confirmDialog, formatDate, promptText } from "./modal";
import { showMenu } from "./contextmenu";
import { addPhotosToNode, MAX_PHOTOS_PER_NODE, pickFiles } from "./photos";
import { state } from "./state";
import type { DrawTool, Photo } from "./types";

const lb = document.getElementById("lightbox") as HTMLDivElement;

type Mode = "grid" | "view";
let mode: Mode = "grid";
let nodeId = "";
let index = 0;
let tool: DrawTool | null = null;

let gridEl!: HTMLDivElement;
let viewEl!: HTMLDivElement;
let frame!: HTMLDivElement;
let img!: HTMLImageElement;
let svg!: SVGSVGElement;
let stage!: HTMLDivElement;
let nameEl!: HTMLSpanElement;
let dateBtn!: HTMLButtonElement;
let counter!: HTMLDivElement;
let hint!: HTMLDivElement;
let toolBtns: HTMLButtonElement[] = [];
const fit = { x: 0, y: 0, scale: 1 };

const TOOL_HINT: Record<DrawTool, string> = {
  ellipse: "Arraste sobre a foto para circular uma área.",
  arrow: "Arraste do início ao ponto que a seta deve apontar.",
  pen: "Desenhe livremente sobre a foto.",
  rect: "Arraste para marcar uma área retangular.",
};

function node() {
  return state.nodes.get(nodeId);
}
function photoIds(): string[] {
  return node()?.photoIds ?? [];
}
function current(): Photo | undefined {
  return state.photos.get(photoIds()[index]);
}
function nodeTitle(): string {
  const n = node();
  const t = n ? firstTitle(n.text).replace(/[*_=~`#]/g, "").trim() : "";
  return t || "Quadro de fotos";
}

/* ---------------- Construção (uma vez) ---------------- */

function buildOnce() {
  if (gridEl) return;
  lb.innerHTML = `
    <div class="lb-grid">
      <div class="lb-top">
        <span class="title"></span>
        <span class="count"></span>
        <button class="add">+ Adicionar fotos</button>
        <button class="close" title="Fechar (Esc)">✕ Fechar</button>
      </div>
      <div class="lb-tiles"></div>
      <div class="lb-foot">Clique numa foto para abrir. Botão direito para opções. Ctrl+V cola uma imagem neste quadro.</div>
    </div>
    <div class="lb-view">
      <div class="lb-top">
        <button class="back" title="Voltar à lista (Esc)">‹ Lista</button>
        <span class="name"></span>
        <span class="tools">
          <span class="tools-label">Marcar:</span>
          <button data-tool="ellipse" title="Circular área (C)">◯</button>
          <button data-tool="arrow" title="Seta (S)">➜</button>
          <button data-tool="rect" title="Retângulo (R)">▭</button>
          <button data-tool="pen" title="Caneta livre (P)">✎</button>
          <button class="undo" title="Apagar última marca (Ctrl+Z)">↶</button>
        </span>
        <button class="date" title="Data em que a foto foi tirada"></button>
        <button class="del danger" title="Remover esta foto do quadro">Remover</button>
        <button class="close" title="Fechar (Esc)">✕</button>
      </div>
      <div class="lb-hint"></div>
      <div class="lb-stage">
        <div class="lb-frame"><img draggable="false"><svg></svg></div>
        <button class="nav prev" title="Anterior (←)">‹</button>
        <button class="nav next" title="Próxima (→)">›</button>
        <div class="counter"></div>
      </div>
    </div>`;
  gridEl = lb.querySelector(".lb-grid")!;
  viewEl = lb.querySelector(".lb-view")!;
  stage = lb.querySelector(".lb-stage")!;
  frame = lb.querySelector(".lb-frame")!;
  img = lb.querySelector(".lb-frame img")!;
  svg = lb.querySelector(".lb-frame svg")!;
  nameEl = lb.querySelector(".lb-view .name")!;
  dateBtn = lb.querySelector(".lb-view .date")!;
  counter = lb.querySelector(".counter")!;
  hint = lb.querySelector(".lb-hint")!;
  toolBtns = [...lb.querySelectorAll<HTMLButtonElement>("[data-tool]")];

  for (const b of lb.querySelectorAll<HTMLButtonElement>(".close")) b.onclick = close;
  gridEl.querySelector<HTMLButtonElement>(".add")!.onclick = async () => {
    const n = node();
    if (!n) return;
    await addPhotosToNode(n, await pickFiles());
    renderGrid();
  };

  for (const b of toolBtns) b.onclick = () => setTool(tool === b.dataset.tool ? null : (b.dataset.tool as DrawTool));
  viewEl.querySelector<HTMLButtonElement>(".back")!.onclick = () => showGrid();
  viewEl.querySelector<HTMLButtonElement>(".prev")!.onclick = () => go(-1);
  viewEl.querySelector<HTMLButtonElement>(".next")!.onclick = () => go(1);
  viewEl.querySelector<HTMLButtonElement>(".undo")!.onclick = undo;
  viewEl.querySelector<HTMLButtonElement>(".del")!.onclick = () => removePhoto(current()?.id);
  dateBtn.onclick = () => editDate(current());

  // Botões dentro do palco não podem iniciar o "arrastar para mover a foto",
  // senão o setPointerCapture do palco engole o clique deles.
  for (const b of stage.querySelectorAll<HTMLButtonElement>("button")) b.addEventListener("pointerdown", (e) => e.stopPropagation());

  let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (tool || e.button === 2 || (e.target as Element).closest("button")) return;
    panning = { sx: e.clientX, sy: e.clientY, ox: fit.x, oy: fit.y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!panning) return;
    fit.x = panning.ox + e.clientX - panning.sx;
    fit.y = panning.oy + e.clientY - panning.sy;
    applyFit();
  });
  const endPan = () => (panning = null);
  stage.addEventListener("pointerup", endPan);
  stage.addEventListener("pointercancel", endPan);
  stage.addEventListener("dblclick", (e) => {
    if ((e.target as Element).closest("button")) return;
    fitToStage();
  });
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const ns = Math.min(12, Math.max(0.05, fit.scale * f));
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
    const id = (e.target as SVGElement).dataset.mark;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, [
      { label: "Apagar esta marca", danger: true, action: () => {
        const p = current();
        if (!p) return;
        p.marks = p.marks.filter((m) => m.id !== id);
        state.savePhoto(p);
        renderMarks();
      } },
    ]);
  });

  lb.addEventListener("contextmenu", (e) => {
    if (!(e.target as Element).closest(".lb-frame")) e.preventDefault();
  });
}

/* ---------------- Grade (lista de fotos) ---------------- */

function showGrid() {
  mode = "grid";
  setTool(null);
  gridEl.hidden = false;
  viewEl.hidden = true;
  renderGrid();
}

function renderGrid() {
  const n = node();
  if (!n) {
    close();
    return;
  }
  gridEl.querySelector<HTMLSpanElement>(".title")!.textContent = nodeTitle();
  gridEl.querySelector<HTMLSpanElement>(".count")!.textContent = `${n.photoIds.length} / ${MAX_PHOTOS_PER_NODE} fotos`;
  const tiles = gridEl.querySelector<HTMLDivElement>(".lb-tiles")!;
  tiles.replaceChildren();
  if (!n.photoIds.length) {
    tiles.innerHTML = `<div class="lb-empty">Nenhuma foto neste quadro ainda. Use "Adicionar fotos", cole com Ctrl+V ou arraste arquivos para o card.</div>`;
    return;
  }
  n.photoIds.forEach((pid, i) => {
    const p = state.photos.get(pid);
    const tile = document.createElement("div");
    tile.className = "lb-tile";
    tile.dataset.index = String(i);
    if (!p) {
      tile.innerHTML = `<div class="ph broken">?</div><div class="meta"><b>foto não encontrada</b></div>`;
      state.ensurePhoto(pid).then((got) => got && renderGrid());
      tiles.append(tile);
      return;
    }
    const im = document.createElement("img");
    im.src = state.thumbUrl(pid);
    im.loading = "lazy";
    im.decoding = "async";
    im.draggable = false;
    im.alt = p.name;
    const ph = document.createElement("div");
    ph.className = "ph";
    ph.append(im);
    if (p.marks.length) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `${p.marks.length} marca${p.marks.length > 1 ? "s" : ""}`;
      ph.append(badge);
    }
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<b></b><span></span>`;
    meta.querySelector("b")!.textContent = `${i + 1}. ${p.name}`;
    meta.querySelector("span")!.textContent = [p.takenAt ? `foto: ${p.takenAt}` : "", `${p.w}×${p.h}`, `add. ${formatDate(p.createdAt)}`].filter(Boolean).join(" · ");
    tile.append(ph, meta);
    tile.onclick = () => showView(i);
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenu(e.clientX, e.clientY, [
        { label: "Abrir", action: () => showView(i) },
        { label: "Data da foto…", action: () => editDate(p) },
        { label: "Renomear…", action: async () => {
          const v = await promptText("Nome da foto", p.name);
          if (!v) return;
          p.name = v;
          state.savePhoto(p);
          renderGrid();
        } },
        { label: "Mover para o início", action: () => reorder(i, 0) },
        { label: "Mover para o fim", action: () => reorder(i, n.photoIds.length - 1) },
        { sep: true },
        { label: "Remover do quadro", danger: true, action: () => removePhoto(p.id) },
      ]);
    };
    tiles.append(tile);
  });
}

function reorder(from: number, to: number) {
  const n = node();
  if (!n || from === to) return;
  const [id] = n.photoIds.splice(from, 1);
  n.photoIds.splice(to, 0, id);
  state.saveNode(n);
  renderGrid();
}

async function editDate(p: Photo | undefined) {
  if (!p) return;
  const v = await promptText("Data da foto (livre)", p.takenAt ?? "", "ex: 14/03/2021, mar/2019, 2020");
  if (v === null) return;
  p.takenAt = v || undefined;
  state.savePhoto(p);
  if (mode === "grid") renderGrid();
  else show();
}

async function removePhoto(pid: string | undefined) {
  const n = node();
  const p = pid ? state.photos.get(pid) : undefined;
  if (!n || !p) return;
  if (!(await confirmDialog("Remover foto", `Remover "${p.name}" deste quadro? As marcas feitas nela também somem. (Ctrl+Z desfaz.)`))) return;
  n.photoIds = n.photoIds.filter((id) => id !== p.id);
  state.saveNode(n);
  if (mode === "view") {
    if (!n.photoIds.length) showGrid();
    else {
      index = Math.min(index, n.photoIds.length - 1);
      show();
    }
  } else renderGrid();
}

/* ---------------- Visualizador ---------------- */

function showView(i: number) {
  mode = "view";
  index = i;
  gridEl.hidden = true;
  viewEl.hidden = false;
  setTool(null);
  show();
}

function setTool(t: DrawTool | null) {
  tool = t;
  if (!stage) return;
  stage.classList.toggle("tool", !!t);
  svg.style.pointerEvents = t ? "none" : "";
  for (const b of toolBtns) b.classList.toggle("active", b.dataset.tool === t);
  hint.textContent = t ? `${TOOL_HINT[t]} Esc para sair da ferramenta.` : "";
  hint.hidden = !t;
}

function applyFit() {
  frame.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
}

function fitToStage() {
  const p = current();
  if (!p) return;
  const r = stage.getBoundingClientRect();
  const s = Math.min(1, (r.width - 40) / p.w, (r.height - 40) / p.h);
  fit.scale = s > 0 && Number.isFinite(s) ? s : 1;
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
  const ids = photoIds();
  if (!ids.length) {
    showGrid();
    return;
  }
  index = ((index % ids.length) + ids.length) % ids.length;
  const p = current();
  if (!p) {
    // blob ainda não carregado do IndexedDB (ex.: logo após desfazer): carrega e tenta de novo
    state.ensurePhoto(ids[index]).then((got) => (got ? show() : showGrid()));
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

/* ---------------- Teclado / abertura ---------------- */

function onKey(e: KeyboardEvent) {
  if (lb.hidden) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (!document.getElementById("modal")!.hidden) return;
  if (mode === "grid") {
    // Na lista, Ctrl+Z/Y continuam sendo o desfazer global (ex.: remover foto).
    if (e.key === "Escape") (e.stopPropagation(), close());
    else if (e.key === "Delete" || e.key === "Backspace") e.stopPropagation();
    return;
  }
  e.stopPropagation();
  switch (e.key) {
    case "Escape": tool ? setTool(null) : showGrid(); break;
    case "ArrowLeft": go(-1); break;
    case "ArrowRight": go(1); break;
    case "c": case "C": setTool(tool === "ellipse" ? null : "ellipse"); break;
    case "s": case "S": setTool(tool === "arrow" ? null : "arrow"); break;
    case "p": case "P": setTool(tool === "pen" ? null : "pen"); break;
    case "r": case "R": setTool(tool === "rect" ? null : "rect"); break;
    case "0": fitToStage(); break;
    case "z": case "Z": if (e.ctrlKey) undo(); break;
    case "Delete": removePhoto(current()?.id); break;
  }
}

/** Abre a lista de fotos do quadro; com `i`, abre direto a foto nessa posição. */
export function openLightbox(nId: string, i?: number) {
  buildOnce();
  nodeId = nId;
  lb.hidden = false;
  if (i === undefined) showGrid();
  else showView(i);
}

export function close() {
  lb.hidden = true;
  setTool(null);
}

export function isLightboxOpen() {
  return !lb.hidden;
}

export function lightboxNodeId() {
  return lb.hidden ? null : nodeId;
}

export function refreshLightbox() {
  if (lb.hidden) return;
  if (!node()) {
    close();
    return;
  }
  if (mode === "grid") renderGrid();
  else show();
}

export function initLightbox() {
  state.on("open-lightbox", (p) => {
    const { nodeId, index } = p as { nodeId: string; index?: number };
    openLightbox(nodeId, index);
  });
  state.on("node", (id) => {
    if (id === nodeId) refreshLightbox();
  });
  state.on("node-removed", (id) => {
    if (id === nodeId) close();
  });
  state.on("case-loaded", close);
  state.on("thumb", () => {
    if (!lb.hidden && mode === "grid") renderGrid();
  });
  window.addEventListener("keydown", onKey, true);
}
