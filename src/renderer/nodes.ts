import { toWorld, view } from "./canvas";
import { edgesOf } from "./edges";
import { renderMarkdown } from "./markdown";
import { formatDate } from "./modal";
import { addPhotosToNode } from "./photos";
import { state } from "./state";
import { annotColor, annotLabel, type Annotation, type BoardNode } from "./types";

const nodesEl = document.getElementById("nodes") as HTMLDivElement;
const underEl = document.getElementById("under") as unknown as SVGSVGElement;
const els = new Map<string, HTMLDivElement>();
const annotConnectors = new Map<string, SVGLineElement>();
let editing: string | null = null;
let editingAnnot: string | null = null;

export function nodeEl(id: string) {
  return els.get(id);
}

function datesHtml(createdAt: number, infoDate?: string): string {
  const parts = [`criado <b>${formatDate(createdAt)}</b>`];
  if (infoDate) parts.push(`info <b>${escape(infoDate)}</b>`);
  return parts.join('<span>·</span>');
}
function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function renderBody(n: BoardNode, body: HTMLDivElement) {
  if (n.type === "note") {
    body.innerHTML = renderMarkdown(n.text);
    return;
  }
  body.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "photo-grid" + (n.photoIds.length === 1 ? " one" : "");
  if (n.photoIds.length === 0) {
    grid.innerHTML = `<div class="empty">sem fotos — botão direito, Ctrl+V ou arraste imagens aqui</div>`;
  }
  const max = 4;
  n.photoIds.slice(0, max).forEach((pid, i) => {
    const t = document.createElement("div");
    t.className = "thumb";
    const img = document.createElement("img");
    img.decoding = "async";
    const url = state.thumbUrl(pid);
    if (url) img.src = url;
    else state.ensurePhoto(pid).then((p) => p && renderNode(n.id));
    img.draggable = false;
    t.append(img);
    if (i === max - 1 && n.photoIds.length > max) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${n.photoIds.length - max + 1}`;
      t.append(more);
    }
    t.addEventListener("pointerdown", (e) => e.stopPropagation());
    t.title = "Clique: lista de fotos · duplo clique: abrir esta foto";
    t.onclick = (e) => {
      e.stopPropagation();
      state.emit("open-lightbox", { nodeId: n.id });
    };
    t.ondblclick = (e) => {
      e.stopPropagation();
      state.emit("open-lightbox", { nodeId: n.id, index: i });
    };
    grid.append(t);
  });
  body.append(grid);
  if (n.text.trim()) {
    const cap = document.createElement("div");
    cap.style.cssText = "margin-top:8px;font-size:12px;user-select:none";
    cap.innerHTML = renderMarkdown(n.text);
    body.append(cap);
  }
}

const ANNOT_W = 210;
const ANNOT_GAP = 26;
const ANNOT_STACK_GAP = 10;

type Side = "left" | "right";

/** Lado (esquerda/direita) menos "ocupado" por ligações já saindo deste quadro. */
function pickSide(n: BoardNode): Side {
  let right = false, left = false;
  for (const e of edgesOf(n.id)) {
    const otherId = e.from === n.id ? e.to : e.from;
    const other = state.nodes.get(otherId);
    if (!other) continue;
    const dx = other.x + other.w / 2 - (n.x + n.w / 2);
    const dy = other.y + other.h / 2 - (n.y + n.h / 2);
    if (Math.abs(dx) < Math.abs(dy)) continue; // ligação predominantemente vertical: não conta pro lado
    if (dx >= 0) right = true;
    else left = true;
  }
  if (right && !left) return "left";
  if (left && !right) return "right";
  return "right";
}

/** Ponto de conexão nas bordas mais próximas entre o quadro e a anotação (mesma lógica das ligações). */
function connectorPoints(n: BoardNode, ax: number, ay: number, aw: number, ah: number) {
  const ncx = n.x + n.w / 2, ncy = n.y + n.h / 2;
  const acx = ax + aw / 2, acy = ay + ah / 2;
  const dx = acx - ncx, dy = acy - ncy;
  const p1 = Math.abs(dx) * n.h > Math.abs(dy) * n.w ? { x: dx > 0 ? n.x + n.w : n.x, y: ncy } : { x: ncx, y: dy > 0 ? n.y + n.h : n.y };
  const p2 = Math.abs(dx) * ah > Math.abs(dy) * aw ? { x: dx > 0 ? ax : ax + aw, y: acy } : { x: acx, y: dy > 0 ? ay : ay + ah };
  return { p1, p2 };
}

function renderAnnots(n: BoardNode, wrap: HTMLDivElement) {
  const side = pickSide(n);
  let autoIndex = 0;
  const seen = new Set<string>();
  for (const [i, a] of n.annotations.entries()) {
    seen.add(a.id);
    let el = wrap.querySelector<HTMLDivElement>(`[data-annot="${a.id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.dataset.annot = a.id;
      el.innerHTML = `<div class="kind"></div><div class="text"></div><div class="dates"></div><div class="grip"></div>`;
      wireAnnot(el, n.id);
      wrap.append(el);
    }
    el.className = `annot ${a.kind}`;
    el.style.setProperty("--annot-color", annotColor(a));
    el.querySelector<HTMLDivElement>(".kind")!.textContent = annotLabel(a);
    if (editingAnnot !== a.id) el.querySelector<HTMLDivElement>(".text")!.innerHTML = renderMarkdown(a.text);
    el.querySelector<HTMLDivElement>(".dates")!.innerHTML = datesHtml(a.createdAt, a.infoDate);

    const w = a.w ?? ANNOT_W;
    const autoX = side === "right" ? n.w + ANNOT_GAP : -(w + ANNOT_GAP);
    const x = a.dx ?? autoX;
    const y = a.dy ?? autoIndex * (el.offsetHeight + ANNOT_STACK_GAP || 110);
    if (a.dx === undefined) autoIndex++;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    if (a.h !== undefined) {
      el.style.height = `${a.h}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = "";
      el.style.overflowY = "visible";
    }

    const h = a.h ?? el.offsetHeight ?? 90;
    state.annotBoxes.set(a.id, { x: n.x + x, y: n.y + y, w, h, nodeId: n.id });
    const { p1, p2 } = connectorPoints(n, x + n.x, y + n.y, w, h);
    let line = annotConnectors.get(a.id);
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke-dasharray", "5 4");
      line.setAttribute("stroke-width", "1");
      annotConnectors.set(a.id, line);
      underEl.append(line);
    }
    line.setAttribute("x1", String(p1.x));
    line.setAttribute("y1", String(p1.y));
    line.setAttribute("x2", String(p2.x));
    line.setAttribute("y2", String(p2.y));
    line.setAttribute("stroke", annotColor(a));
  }
  // Só limpa conectores de anotações que ERAM deste quadro e sumiram —
  // o mapa é global, então checar contra `seen` apagava os dos outros quadros.
  for (const el of [...wrap.children] as HTMLDivElement[]) {
    const id = el.dataset.annot!;
    if (seen.has(id)) continue;
    el.remove();
    removeAnnotConnector(id);
  }
}

function removeAnnotConnector(id: string) {
  annotConnectors.get(id)?.remove();
  annotConnectors.delete(id);
  state.annotBoxes.delete(id);
}

function wireAnnot(el: HTMLDivElement, nodeId: string) {
  const annotId = el.dataset.annot!;
  el.addEventListener("dblclick", (e) => {
    if ((e.target as Element).closest(".kind, .grip")) return;
    e.stopPropagation();
    editAnnotation(nodeId, annotId);
  });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.emit("ctx", { kind: "annot", nodeId, annotId, x: e.clientX, y: e.clientY });
  });
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.button === 0 && state.tool.kind === "link") state.emit("link-target", annotId);
  });
  el.querySelector<HTMLDivElement>(".kind")!.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || state.tool.kind === "link") return;
    e.stopPropagation();
    startAnnotDrag(e, nodeId, annotId);
  });
  el.querySelector<HTMLDivElement>(".grip")!.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    startAnnotResize(e, nodeId, annotId);
  });
}

function startAnnotDrag(e: PointerEvent, nodeId: string, annotId: string) {
  const n = state.nodes.get(nodeId);
  const a = n?.annotations.find((x) => x.id === annotId);
  const el = els.get(nodeId)?.querySelector<HTMLDivElement>(`[data-annot="${annotId}"]`);
  if (!n || !a || !el) return;
  const start = toWorld(e.clientX, e.clientY);
  const ox = a.dx ?? el.offsetLeft, oy = a.dy ?? el.offsetTop;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const p = toWorld(ev.clientX, ev.clientY);
    a.dx = Math.round(ox + (p.x - start.x));
    a.dy = Math.round(oy + (p.y - start.y));
    renderNode(nodeId);
    state.emit("node-moved", nodeId);
  };
  const up = () => {
    (e.target as HTMLElement).removeEventListener("pointermove", move);
    (e.target as HTMLElement).removeEventListener("pointerup", up);
    state.saveNode(n);
  };
  (e.target as HTMLElement).addEventListener("pointermove", move);
  (e.target as HTMLElement).addEventListener("pointerup", up);
}

function startAnnotResize(e: PointerEvent, nodeId: string, annotId: string) {
  const n = state.nodes.get(nodeId);
  const a = n?.annotations.find((x) => x.id === annotId);
  const el = els.get(nodeId)?.querySelector<HTMLDivElement>(`[data-annot="${annotId}"]`);
  if (!n || !a || !el) return;
  // Materializa a posição/tamanho automáticos antes de redimensionar, senão o card "pula".
  if (a.dx === undefined) a.dx = el.offsetLeft;
  if (a.dy === undefined) a.dy = el.offsetTop;
  const start = toWorld(e.clientX, e.clientY);
  const ow = a.w ?? el.offsetWidth, oh = a.h ?? el.offsetHeight;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const p = toWorld(ev.clientX, ev.clientY);
    a.w = Math.max(140, Math.round(ow + p.x - start.x));
    a.h = Math.max(50, Math.round(oh + p.y - start.y));
    renderNode(nodeId);
    state.emit("node-moved", nodeId);
  };
  const up = () => {
    (e.target as HTMLElement).removeEventListener("pointermove", move);
    (e.target as HTMLElement).removeEventListener("pointerup", up);
    state.saveNode(n);
  };
  (e.target as HTMLElement).addEventListener("pointermove", move);
  (e.target as HTMLElement).addEventListener("pointerup", up);
}

function place(n: BoardNode, el: HTMLDivElement) {
  el.style.left = `${n.x}px`;
  el.style.top = `${n.y}px`;
  el.style.width = `${n.w}px`;
  el.style.height = `${n.h}px`;
  el.style.zIndex = String(n.z);
  el.style.setProperty("--node-color", n.color ?? "#3a3a3a");
}

export function renderNode(id: string) {
  const n = state.nodes.get(id);
  if (!n) return;
  let el = els.get(id);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = id;
    el.innerHTML = `<div class="dragbar"></div><div class="body"></div><div class="dates"></div><div class="grip"></div><div class="annots"></div>`;
    nodesEl.append(el);
    els.set(id, el);
    wire(el);
  }
  el.className = `node ${n.type}` + (state.selection?.kind === "node" && state.selection.id === id ? " selected" : "") + (state.tool.kind === "link" ? " link-target" : "");
  place(n, el);
  if (editing !== id) renderBody(n, el.querySelector(".body")!);
  el.querySelector<HTMLDivElement>(".dates")!.innerHTML = datesHtml(n.createdAt, n.infoDate);
  renderAnnots(n, el.querySelector(".annots")!);
}

function fitToContent(n: BoardNode) {
  const el = els.get(n.id);
  if (!el || n.type !== "note") return;
  const body = el.querySelector<HTMLDivElement>(".body")!;
  const needed = n.h + (body.scrollHeight - body.clientHeight);
  if (needed > n.h + 2) {
    n.h = Math.min(900, needed + 2);
    place(n, el);
    state.saveNode(n);
  }
}

export function renderAllNodes() {
  nodesEl.replaceChildren();
  els.clear();
  editing = null;
  editingAnnot = null;
  for (const id of [...annotConnectors.keys()]) removeAnnotConnector(id);
  for (const id of state.nodes.keys()) renderNode(id);
}

function wire(el: HTMLDivElement) {
  const id = el.dataset.id!;
  const grip = el.querySelector<HTMLDivElement>(".grip")!;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (state.tool.kind === "link") {
      e.stopPropagation();
      state.emit("link-target", id);
      return;
    }
    if (state.tool.kind !== "select") return;
    if (editing === id) {
      e.stopPropagation();
      return;
    }
    const n = state.nodes.get(id)!;
    e.stopPropagation();
    state.select({ kind: "node", id });
    if (e.target === grip) {
      startResize(e, n);
    } else {
      startDrag(e, n);
    }
  });

  el.addEventListener("dblclick", (e) => {
    if ((e.target as Element).closest(".annots, .thumb")) return;
    e.stopPropagation();
    editNode(id);
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (editing === id) return;
    state.select({ kind: "node", id });
    state.emit("ctx", { kind: "node", id, x: e.clientX, y: e.clientY });
  });

  el.addEventListener("dragover", (e) => {
    if (state.nodes.get(id)?.type !== "photos") return;
    e.preventDefault();
    el.classList.add("drop-target");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
  el.addEventListener("drop", async (e) => {
    el.classList.remove("drop-target");
    const n = state.nodes.get(id);
    if (n?.type !== "photos") return;
    e.preventDefault();
    e.stopPropagation();
    await addPhotosToNode(n, e.dataTransfer?.files ?? []);
  });
}

function startDrag(e: PointerEvent, n: BoardNode) {
  const el = els.get(n.id)!;
  const start = toWorld(e.clientX, e.clientY);
  const ox = n.x, oy = n.y;
  let moved = false;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const p = toWorld(ev.clientX, ev.clientY);
    const dx = p.x - start.x, dy = p.y - start.y;
    if (!moved && Math.hypot(dx, dy) * view.zoom < 3) return;
    moved = true;
    n.x = Math.round(ox + dx);
    n.y = Math.round(oy + dy);
    place(n, el);
    state.emit("node-moved", n.id);
  };
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    if (moved) state.saveNode(n);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

function startResize(e: PointerEvent, n: BoardNode) {
  const el = els.get(n.id)!;
  const start = toWorld(e.clientX, e.clientY);
  const ow = n.w, oh = n.h;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const p = toWorld(ev.clientX, ev.clientY);
    n.w = Math.max(140, Math.round(ow + p.x - start.x));
    n.h = Math.max(60, Math.round(oh + p.y - start.y));
    place(n, el);
    state.emit("node-moved", n.id);
  };
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    state.saveNode(n);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}

export function editNode(id: string) {
  const n = state.nodes.get(id);
  const el = els.get(id);
  if (!n || !el || editing === id) return;
  editing = id;
  const body = el.querySelector<HTMLDivElement>(".body")!;
  const ta = document.createElement("textarea");
  ta.value = n.text;
  ta.placeholder = n.type === "photos" ? "Legenda (opcional)" : "# Título\nTexto com **negrito**, *itálico*, ==marca-texto==, - listas";
  ta.spellcheck = false;
  body.replaceWith(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const grow = () => {
    const overflow = ta.scrollHeight - ta.clientHeight;
    if (overflow <= 0) return;
    n.h = Math.min(900, n.h + overflow);
    place(n, el);
    state.emit("node-moved", n.id);
  };
  ta.addEventListener("input", grow);
  const finish = () => {
    if (editing !== id) return;
    editing = null;
    n.text = ta.value;
    const nb = document.createElement("div");
    nb.className = "body";
    ta.replaceWith(nb);
    state.saveNode(n);
    fitToContent(n);
  };
  ta.addEventListener("blur", finish);
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) ta.blur();
  });
  ta.addEventListener("pointerdown", (e) => e.stopPropagation());
  ta.addEventListener("contextmenu", (e) => e.stopPropagation());
}

export function editAnnotation(nodeId: string, annotId: string) {
  const n = state.nodes.get(nodeId);
  const el = els.get(nodeId);
  const a = n?.annotations.find((x) => x.id === annotId);
  if (!n || !el || !a || editingAnnot === annotId) return;
  const ad = el.querySelector<HTMLDivElement>(`[data-annot="${annotId}"]`);
  if (!ad) return;
  editingAnnot = annotId;
  const textEl = ad.querySelector<HTMLDivElement>(".text")!;
  const ta = document.createElement("textarea");
  ta.value = a.text;
  ta.placeholder = "O que mudou / o que contradiz";
  textEl.replaceWith(ta);
  ta.focus();
  const finish = () => {
    if (editingAnnot !== annotId) return;
    editingAnnot = null;
    a.text = ta.value;
    const nb = document.createElement("div");
    nb.className = "text";
    ta.replaceWith(nb);
    state.saveNode(n);
  };
  ta.addEventListener("blur", finish);
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) ta.blur();
  });
  ta.addEventListener("pointerdown", (e) => e.stopPropagation());
  ta.addEventListener("wheel", (e) => e.stopPropagation());
}

export function addAnnotation(nodeId: string, kind: Annotation["kind"], custom?: { label: string; color: string }) {
  const n = state.nodes.get(nodeId);
  if (!n) return;
  const a: Annotation = { id: crypto.randomUUID(), kind, text: "", createdAt: Date.now(), ...(kind === "custom" ? custom : {}) };
  n.annotations.push(a);
  state.saveNode(n);
  requestAnimationFrame(() => editAnnotation(nodeId, a.id));
}

export function initNodes() {
  state.on("case-loaded", renderAllNodes);
  state.on("node", (id) => renderNode(id as string));
  state.on("node-removed", (id) => {
    const el = els.get(id as string);
    for (const a of el?.querySelectorAll<HTMLDivElement>("[data-annot]") ?? []) removeAnnotConnector(a.dataset.annot!);
    el?.remove();
    els.delete(id as string);
  });
  state.on("selection", () => {
    for (const [id, el] of els) el.classList.toggle("selected", state.selection?.kind === "node" && state.selection.id === id);
  });
  state.on("tool", () => {
    for (const el of els.values()) {
      el.classList.toggle("link-target", state.tool.kind === "link");
      for (const a of el.querySelectorAll(".annot")) a.classList.toggle("link-target", state.tool.kind === "link");
    }
  });
  state.on("node-moved", (id) => {
    const n = state.nodes.get(id as string);
    const el = els.get(id as string);
    if (n && el && n.annotations.length) renderAnnots(n, el.querySelector(".annots")!);
  });
  state.on("thumb", (pid) => {
    for (const n of state.nodes.values()) if (n.photoIds.slice(0, 4).includes(pid as string)) renderNode(n.id);
  });
}
