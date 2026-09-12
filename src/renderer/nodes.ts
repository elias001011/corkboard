import { toWorld, view } from "./canvas";
import { renderMarkdown } from "./markdown";
import { formatDate } from "./modal";
import { addPhotosToNode } from "./photos";
import { state } from "./state";
import type { Annotation, BoardNode } from "./types";

const nodesEl = document.getElementById("nodes") as HTMLDivElement;
const els = new Map<string, HTMLDivElement>();
let editing: string | null = null;

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
    img.src = state.photoUrl(pid);
    img.draggable = false;
    t.append(img);
    if (i === max - 1 && n.photoIds.length > max) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${n.photoIds.length - max + 1}`;
      t.append(more);
    }
    t.onclick = (e) => {
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

function renderAnnots(n: BoardNode, wrap: HTMLDivElement) {
  wrap.innerHTML = "";
  for (const a of n.annotations) {
    const d = document.createElement("div");
    d.className = `annot ${a.kind}`;
    d.dataset.annot = a.id;
    d.innerHTML = `<div class="kind">${a.kind === "update" ? "Atualização" : "Contradição"}</div><div class="text">${renderMarkdown(a.text)}</div><div class="dates">${datesHtml(a.createdAt, a.infoDate)}</div>`;
    d.ondblclick = (e) => {
      e.stopPropagation();
      editAnnotation(n.id, a.id);
    };
    d.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.emit("ctx", { kind: "annot", nodeId: n.id, annotId: a.id, x: e.clientX, y: e.clientY });
    };
    d.onpointerdown = (e) => e.stopPropagation();
    wrap.append(d);
  }
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
    const extra = el.offsetHeight - ta.offsetHeight;
    const needed = ta.scrollHeight + extra + 2;
    if (needed > n.h) {
      n.h = Math.min(900, needed);
      place(n, el);
      state.emit("node-moved", n.id);
    }
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
  if (!n || !el || !a) return;
  const ad = el.querySelector<HTMLDivElement>(`[data-annot="${annotId}"]`);
  if (!ad) return;
  const textEl = ad.querySelector<HTMLDivElement>(".text")!;
  const ta = document.createElement("textarea");
  ta.value = a.text;
  ta.placeholder = "O que mudou / o que contradiz";
  textEl.replaceWith(ta);
  ta.focus();
  ta.addEventListener("blur", () => {
    a.text = ta.value;
    state.saveNode(n);
  });
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) ta.blur();
  });
  ta.addEventListener("pointerdown", (e) => e.stopPropagation());
}

export function addAnnotation(nodeId: string, kind: Annotation["kind"]) {
  const n = state.nodes.get(nodeId);
  if (!n) return;
  const a: Annotation = { id: crypto.randomUUID(), kind, text: "", createdAt: Date.now() };
  n.annotations.push(a);
  state.saveNode(n);
  requestAnimationFrame(() => editAnnotation(nodeId, a.id));
}

export function initNodes() {
  state.on("case-loaded", renderAllNodes);
  state.on("node", (id) => renderNode(id as string));
  state.on("node-removed", (id) => {
    els.get(id as string)?.remove();
    els.delete(id as string);
  });
  state.on("selection", () => {
    for (const [id, el] of els) el.classList.toggle("selected", state.selection?.kind === "node" && state.selection.id === id);
  });
  state.on("tool", () => {
    for (const el of els.values()) el.classList.toggle("link-target", state.tool.kind === "link");
  });
}
