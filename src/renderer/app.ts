import { exportBackup, importBackup } from "./backup";
import { centerOnContent, initCanvas, setView, toWorld, viewportEl } from "./canvas";
import { showMenu, type MenuItem } from "./contextmenu";
import { initDrawings } from "./drawings";
import { edgesTouching, initEdges, startLink } from "./edges";
import { exportForAi } from "./exportAi";
import { initLightbox, lightboxNodeId } from "./lightbox";
import { confirmDialog, datesDialog, formatDate, promptText } from "./modal";
import { addAnnotation, editAnnotation, editNode, initNodes } from "./nodes";
import { addPhotosToNode, imagesFromClipboard, initPhotos, pickFiles } from "./photos";
import { state } from "./state";
import { flushSaves, prefs, store } from "./store";
import { uid, type BoardNode, type Case, type DrawTool, type NodeType } from "./types";

const casesEl = document.getElementById("cases") as HTMLDivElement;
const boardEl = document.getElementById("board") as HTMLDivElement;
const hudCase = document.getElementById("hud-case") as HTMLSpanElement;
const hudTool = document.getElementById("hud-tool") as HTMLSpanElement;
const hudHistory = document.getElementById("hud-history") as HTMLSpanElement;

const NODE_COLORS = ["#3a3a3a", "#e0b24a", "#e05a4a", "#4a90e0", "#4ac07a", "#b06ae0", "#e08a4a"];
const DRAW_COLORS = ["#e05a4a", "#e0b24a", "#4ac07a", "#4a90e0", "#ffffff", "#b06ae0"];
const TOOL_NAMES: Record<DrawTool, string> = { pen: "Caneta", ellipse: "Círculo", rect: "Retângulo", arrow: "Seta" };

/* ---------------- Casos ---------------- */

async function showCases() {
  boardEl.hidden = true;
  casesEl.hidden = false;
  state.currentCase = null;
  prefs.set("lastCase", "");
  const cases = (await store.getAll<Case>("cases")).sort((a, b) => b.updatedAt - a.updatedAt);
  const nodes = await store.getAll<BoardNode>("nodes");
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.caseId, (counts.get(n.caseId) ?? 0) + 1);

  casesEl.innerHTML = `<h1>Corkboard</h1>`;
  const list = document.createElement("div");
  list.className = "case-list";
  if (!cases.length) list.innerHTML = `<div class="case-empty">Nenhuma investigação ainda. Crie a primeira.</div>`;
  for (const c of cases) {
    const item = document.createElement("div");
    item.className = "case-item";
    item.innerHTML = `<span class="name"></span><span class="meta">${counts.get(c.id) ?? 0} quadro(s) · ${formatDate(c.updatedAt)}</span><span class="actions"><button class="rename">Renomear</button><button class="del danger">Excluir</button></span>`;
    item.querySelector(".name")!.textContent = c.name;
    item.onclick = () => openCase(c);
    item.querySelector<HTMLButtonElement>(".rename")!.onclick = async (e) => {
      e.stopPropagation();
      const v = await promptText("Renomear investigação", c.name);
      if (!v) return;
      c.name = v;
      await store.put("cases", c);
      showCases();
    };
    item.querySelector<HTMLButtonElement>(".del")!.onclick = async (e) => {
      e.stopPropagation();
      if (!(await confirmDialog("Excluir investigação", `Excluir "${c.name}" e todos os seus quadros, fotos e ligações? Não dá para desfazer.`))) return;
      await store.deleteCase(c.id);
      showCases();
    };
    list.append(item);
  }
  casesEl.append(list);
  const footer = document.createElement("div");
  footer.className = "cases-footer";
  const newBtn = Object.assign(document.createElement("button"), { textContent: "+ Nova investigação", className: "primary" });
  newBtn.onclick = async () => {
    const name = await promptText("Nome da investigação", "", "ex: Caso 001");
    if (!name) return;
    const c: Case = { id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), viewport: { x: 0, y: 0, zoom: 1 } };
    await store.put("cases", c);
    openCase(c);
  };
  const exp = Object.assign(document.createElement("button"), { textContent: "Exportar backup" });
  exp.onclick = exportBackup;
  const imp = Object.assign(document.createElement("button"), { textContent: "Importar backup" });
  imp.onclick = async () => {
    if (await importBackup()) showCases();
  };
  footer.append(newBtn, exp, imp);
  casesEl.append(footer);
}

async function openCase(c: Case) {
  casesEl.hidden = true;
  boardEl.hidden = false;
  hudCase.textContent = c.name;
  prefs.set("lastCase", c.id);
  await state.loadCase(c);
  const r = viewportEl.getBoundingClientRect();
  if (c.viewport.x === 0 && c.viewport.y === 0 && c.viewport.zoom === 1 && state.nodes.size === 0) {
    setView({ x: r.width / 2, y: r.height / 2, zoom: 1 });
  } else setView(c.viewport);
}

/* ---------------- Criação ---------------- */

function createNode(type: NodeType, x: number, y: number): BoardNode {
  const n: BoardNode = {
    id: uid(),
    caseId: state.currentCase!.id,
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: type === "photos" ? 280 : 240,
    h: type === "photos" ? 220 : 120,
    text: "",
    z: state.nextZ(),
    createdAt: Date.now(),
    photoIds: [],
    annotations: [],
  };
  state.saveNode(n);
  state.select({ kind: "node", id: n.id });
  return n;
}

async function pasteImages(files: File[], at?: { x: number; y: number }) {
  if (!files.length || !state.currentCase) return;
  const lbNode = lightboxNodeId();
  const sel = lbNode ? state.nodes.get(lbNode) : state.selection?.kind === "node" ? state.nodes.get(state.selection.id) : undefined;
  let target = sel?.type === "photos" ? sel : undefined;
  if (!target) {
    const r = viewportEl.getBoundingClientRect();
    const p = at ?? toWorld(r.left + r.width / 2, r.top + r.height / 2);
    target = createNode("photos", p.x - 140, p.y - 110);
  }
  await addPhotosToNode(target, files);
}

/* ---------------- Menus ---------------- */

function drawSubmenu(): MenuItem[] {
  const tools: DrawTool[] = ["pen", "ellipse", "rect", "arrow"];
  return [
    ...tools.map((t) => ({ label: TOOL_NAMES[t], action: () => state.setTool({ kind: "draw", tool: t }) })),
    { sep: true },
    { swatches: DRAW_COLORS, onPick: (c) => {
      state.drawColor = c;
      prefs.set("drawColor", c);
    } },
  ];
}

function boardMenu(x: number, y: number) {
  const w = toWorld(x, y);
  const items: MenuItem[] = [
    { label: "Nova anotação", key: "N", action: () => editNode(createNode("note", w.x, w.y).id) },
    { label: "Novo quadro de fotos", key: "F", action: async () => {
      const n = createNode("photos", w.x, w.y);
      const files = await pickFiles();
      if (files.length) await addPhotosToNode(n, files);
    } },
    { label: "Desenhar", sub: drawSubmenu() },
    { sep: true },
    { label: "Desfazer", key: "Ctrl+Z", action: () => state.undo() },
    { label: "Refazer", key: "Ctrl+Shift+Z", action: () => state.redo() },
    { label: "Centralizar", key: "Ctrl+0", action: centerOnContent },
    { sep: true },
    { label: "Exportar para IA (ZIP com .md)", action: exportForAi },
    { sep: true },
    { label: "Exportar backup", action: exportBackup },
    { label: "Importar backup", action: async () => {
      if (await importBackup()) showCases();
    } },
    { sep: true },
    { label: "Voltar às investigações", action: showCases },
  ];
  showMenu(x, y, items);
}

function nodeMenu(id: string, x: number, y: number) {
  const n = state.nodes.get(id);
  if (!n) return;
  const items: MenuItem[] = [];
  if (n.type === "photos") {
    items.push({ label: "Adicionar fotos…", action: async () => addPhotosToNode(n, await pickFiles()) });
    items.push({ label: "Lista de fotos", action: () => state.emit("open-lightbox", { nodeId: id }) });
    items.push({ label: "Editar legenda", action: () => editNode(id) });
  } else {
    items.push({ label: "Editar", key: "2× clique", action: () => editNode(id) });
  }
  items.push(
    { label: "Ligar a…", action: () => startLink(id) },
    { label: "Anotação subjetiva", sub: [
      { label: "Atualização (info nova)", action: () => addAnnotation(id, "update") },
      { label: "Contradição (fatos conflitam)", action: () => addAnnotation(id, "contradiction") },
    ] },
    { label: "Datas…", action: async () => {
      const r = await datesDialog({ createdAt: n.createdAt, infoDate: n.infoDate });
      if (!r) return;
      n.createdAt = r.createdAt;
      n.infoDate = r.infoDate;
      state.saveNode(n);
    } },
    { label: "Cor", sub: [{ swatches: NODE_COLORS, onPick: (c) => {
      n.color = c === NODE_COLORS[0] ? undefined : c;
      state.saveNode(n);
    } }] },
    { sep: true },
    { label: "Duplicar", action: () => {
      const copy: BoardNode = { ...structuredClone(n), id: uid(), x: n.x + 30, y: n.y + 30, z: state.nextZ(), photoIds: [], annotations: n.annotations.map((a) => ({ ...a, id: uid() })) };
      state.saveNode(copy);
    } },
    { label: "Trazer para frente", action: () => {
      n.z = state.nextZ();
      state.saveNode(n);
    } },
    { sep: true },
    { label: "Excluir", key: "Del", danger: true, action: () => deleteNode(id) },
  );
  showMenu(x, y, items);
}

async function deleteNode(id: string) {
  const n = state.nodes.get(id);
  if (!n) return;
  const risky = n.photoIds.length > 0 || n.text.trim().length > 40 || n.annotations.length > 0;
  if (risky && !(await confirmDialog("Excluir quadro", "Excluir este quadro, suas anotações subjetivas, fotos e ligações?"))) return;
  state.removeNode(id);
}

function annotMenu(nodeId: string, annotId: string, x: number, y: number) {
  const n = state.nodes.get(nodeId);
  const a = n?.annotations.find((z) => z.id === annotId);
  if (!n || !a) return;
  showMenu(x, y, [
    { label: "Editar", key: "2× clique", action: () => editAnnotation(nodeId, annotId) },
    { label: "Ligar a…", action: () => startLink(annotId) },
    { label: a.kind === "update" ? "Marcar como contradição" : "Marcar como atualização", action: () => {
      a.kind = a.kind === "update" ? "contradiction" : "update";
      state.saveNode(n);
    } },
    { label: "Datas…", action: async () => {
      const r = await datesDialog({ createdAt: a.createdAt, infoDate: a.infoDate });
      if (!r) return;
      a.createdAt = r.createdAt;
      a.infoDate = r.infoDate;
      state.saveNode(n);
    } },
    { sep: true },
    { label: "Excluir", danger: true, action: () => {
      for (const e of edgesTouching(annotId)) state.removeEdge(e.id, true);
      n.annotations = n.annotations.filter((z) => z.id !== annotId);
      state.saveNode(n);
    } },
  ]);
}

function edgeMenu(id: string, x: number, y: number) {
  const e = state.edges.get(id);
  if (!e) return;
  showMenu(x, y, [
    { label: "Rótulo…", action: async () => {
      const v = await promptText("Rótulo da ligação", e.label ?? "", "ex: irmão de, viu em 2019, contradiz");
      if (v === null) return;
      e.label = v || undefined;
      state.saveEdge(e);
    } },
    { label: "Inverter sentido", action: () => {
      [e.from, e.to] = [e.to, e.from];
      state.saveEdge(e);
    } },
    { label: "Cor", sub: [{ swatches: ["#777777", ...DRAW_COLORS], onPick: (c) => {
      e.color = c === "#777777" ? undefined : c;
      state.saveEdge(e);
    } }] },
    { sep: true },
    { label: "Excluir", key: "Del", danger: true, action: () => state.removeEdge(id) },
  ]);
}

function drawingMenu(id: string, x: number, y: number) {
  const d = state.drawings.get(id);
  if (!d) return;
  showMenu(x, y, [
    { label: "Cor", sub: [{ swatches: DRAW_COLORS, onPick: (c) => {
      d.color = c;
      state.saveDrawing(d);
    } }] },
    { label: "Espessura", sub: [2, 3, 5, 8].map((w) => ({ label: `${w}px`, action: () => {
      d.width = w;
      state.saveDrawing(d);
    } })) },
    { sep: true },
    { label: "Excluir", key: "Del", danger: true, action: () => state.removeDrawing(id) },
  ]);
}

/* ---------------- Teclado / colar ---------------- */

function deleteSelection() {
  const s = state.selection;
  if (!s) return;
  if (s.kind === "node") deleteNode(s.id);
  else if (s.kind === "edge") state.removeEdge(s.id);
  else state.removeDrawing(s.id);
}

function onKey(e: KeyboardEvent) {
  if (boardEl.hidden) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
  if (e.key === "Escape") {
    if (state.tool.kind !== "select") state.emit("tool-cancel"), state.setTool({ kind: "select" });
    else state.select(null);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    deleteSelection();
  } else if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    e.shiftKey ? state.redo() : state.undo();
  } else if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    state.redo();
  } else if (e.ctrlKey && e.key === "0") {
    centerOnContent();
  } else if (e.key === "n" || e.key === "N") {
    const r = viewportEl.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    editNode(createNode("note", p.x - 120, p.y - 60).id);
  } else if (e.key === "f" || e.key === "F") {
    const r = viewportEl.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const n = createNode("photos", p.x - 140, p.y - 110);
    pickFiles().then((files) => files.length && addPhotosToNode(n, files));
  } else if (["1", "2", "3", "4"].includes(e.key)) {
    const tools: DrawTool[] = ["pen", "ellipse", "rect", "arrow"];
    state.setTool({ kind: "draw", tool: tools[Number(e.key) - 1] });
  }
}

/* ---------------- Bootstrap ---------------- */

async function main() {
  initCanvas();
  initNodes();
  initEdges();
  initDrawings();
  initLightbox();
  initPhotos();
  state.drawColor = prefs.get("drawColor") ?? state.drawColor;

  viewportEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (state.tool.kind !== "select") {
      state.emit("tool-cancel");
      state.setTool({ kind: "select" });
      return;
    }
    boardMenu(e.clientX, e.clientY);
  });

  state.on("ctx", (p) => {
    const c = p as { kind: string; id?: string; nodeId?: string; annotId?: string; x: number; y: number };
    if (state.tool.kind !== "select") {
      state.emit("tool-cancel");
      state.setTool({ kind: "select" });
      return;
    }
    if (c.kind === "node") nodeMenu(c.id!, c.x, c.y);
    else if (c.kind === "edge") edgeMenu(c.id!, c.x, c.y);
    else if (c.kind === "drawing") drawingMenu(c.id!, c.x, c.y);
    else if (c.kind === "annot") annotMenu(c.nodeId!, c.annotId!, c.x, c.y);
  });

  state.on("tool", () => {
    const t = state.tool;
    hudTool.textContent = t.kind === "draw" ? `${TOOL_NAMES[t.tool]} — Esc para sair` : t.kind === "link" ? "Clique no quadro de destino — Esc cancela" : "";
    viewportEl.classList.toggle("tool-link", t.kind === "link");
  });

  state.on("history", () => {
    hudHistory.textContent = state.canUndo ? `Ctrl+Z desfaz${state.canRedo ? " · Ctrl+Shift+Z refaz" : ""}` : "";
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("paste", (e) => {
    if (boardEl.hidden || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    const files = imagesFromClipboard(e);
    if (files.length) {
      e.preventDefault();
      pasteImages(files);
    }
  });
  viewportEl.addEventListener("dragover", (e) => e.preventDefault());
  viewportEl.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) pasteImages(files, toWorld(e.clientX, e.clientY));
  });
  window.addEventListener("beforeunload", () => flushSaves());

  store.collectOrphanPhotos().catch(() => {});
  const last = prefs.get("lastCase");
  const c = last ? await store.get<Case>("cases", last) : undefined;
  if (c) openCase(c);
  else showCases();
}

main();
