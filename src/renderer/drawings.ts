import { toWorld, viewportEl } from "./canvas";
import { state } from "./state";
import { uid, type Drawing, type DrawTool } from "./types";

const SVG = "http://www.w3.org/2000/svg";
const overEl = document.getElementById("over") as unknown as SVGSVGElement;
const shapes = new Map<string, SVGElement>();

export function drawingToSvg(d: Drawing, el?: SVGElement): SVGElement {
  const p = d.points;
  let out: SVGElement;
  switch (d.tool) {
    case "pen": {
      out = el?.tagName === "polyline" ? el : document.createElementNS(SVG, "polyline");
      out.setAttribute("points", p.join(" "));
      break;
    }
    case "ellipse": {
      out = el?.tagName === "ellipse" ? el : document.createElementNS(SVG, "ellipse");
      out.setAttribute("cx", String((p[0] + p[2]) / 2));
      out.setAttribute("cy", String((p[1] + p[3]) / 2));
      out.setAttribute("rx", String(Math.abs(p[2] - p[0]) / 2));
      out.setAttribute("ry", String(Math.abs(p[3] - p[1]) / 2));
      break;
    }
    case "rect": {
      out = el?.tagName === "rect" ? el : document.createElementNS(SVG, "rect");
      out.setAttribute("x", String(Math.min(p[0], p[2])));
      out.setAttribute("y", String(Math.min(p[1], p[3])));
      out.setAttribute("width", String(Math.abs(p[2] - p[0])));
      out.setAttribute("height", String(Math.abs(p[3] - p[1])));
      out.setAttribute("rx", "6");
      break;
    }
    case "arrow": {
      out = el?.tagName === "path" ? el : document.createElementNS(SVG, "path");
      const [x1, y1, x2, y2] = p;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.max(10, d.width * 4);
      const a1 = ang + Math.PI * 0.8, a2 = ang - Math.PI * 0.8;
      out.setAttribute("d", `M${x1},${y1} L${x2},${y2} M${x2},${y2} L${x2 + len * Math.cos(a1)},${y2 + len * Math.sin(a1)} M${x2},${y2} L${x2 + len * Math.cos(a2)},${y2 + len * Math.sin(a2)}`);
      break;
    }
  }
  out.classList.add("drawing");
  out.setAttribute("stroke", d.color);
  out.setAttribute("stroke-width", String(d.width));
  return out;
}

export interface SurfaceOpts {
  svg: SVGSVGElement;
  hostEl: HTMLElement;
  toLocal: (clientX: number, clientY: number) => { x: number; y: number };
  getTool: () => DrawTool | null;
  getColor: () => string;
  getWidth: () => number;
  onCommit: (d: Drawing) => void;
}

export function attachDrawSurface(o: SurfaceOpts) {
  let live: { d: Drawing; el: SVGElement } | null = null;
  o.hostEl.addEventListener("pointerdown", (e) => {
    const tool = o.getTool();
    if (!tool || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = o.toLocal(e.clientX, e.clientY);
    const d: Drawing = { id: uid(), caseId: state.currentCase?.id ?? "", tool, points: [p.x, p.y, p.x, p.y], color: o.getColor(), width: o.getWidth() };
    live = { d, el: drawingToSvg(d) };
    o.svg.append(live.el);
    o.hostEl.setPointerCapture(e.pointerId);
  });
  o.hostEl.addEventListener("pointermove", (e) => {
    if (!live) return;
    const p = o.toLocal(e.clientX, e.clientY);
    if (live.d.tool === "pen") live.d.points.push(p.x, p.y);
    else live.d.points.splice(2, 2, p.x, p.y);
    drawingToSvg(live.d, live.el);
  });
  const end = () => {
    if (!live) return;
    const { d, el } = live;
    live = null;
    el.remove();
    const [x1, y1, x2, y2] = d.tool === "pen" ? [d.points[0], d.points[1], d.points.at(-2)!, d.points.at(-1)!] : d.points;
    const tiny = d.tool === "pen" ? d.points.length < 6 : Math.hypot(x2 - x1, y2 - y1) < 4;
    if (!tiny) o.onCommit(d);
  };
  o.hostEl.addEventListener("pointerup", end);
  o.hostEl.addEventListener("pointercancel", end);
}

export function renderDrawing(id: string) {
  const d = state.drawings.get(id);
  if (!d) return;
  let el = shapes.get(id);
  const fresh = !el;
  el = drawingToSvg(d, el);
  if (fresh) {
    overEl.append(el);
    shapes.set(id, el);
    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      state.select({ kind: "drawing", id });
      state.emit("ctx", { kind: "drawing", id, x: ev.clientX, y: ev.clientY });
    });
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || state.tool.kind !== "select") return;
      ev.stopPropagation();
      state.select({ kind: "drawing", id });
    });
  }
  el.classList.toggle("selected", state.selection?.kind === "drawing" && state.selection.id === id);
}

export function initDrawings() {
  state.on("case-loaded", () => {
    for (const s of shapes.values()) s.remove();
    shapes.clear();
    for (const id of state.drawings.keys()) renderDrawing(id);
  });
  state.on("drawing", (id) => renderDrawing(id as string));
  state.on("drawing-removed", (id) => {
    shapes.get(id as string)?.remove();
    shapes.delete(id as string);
  });
  state.on("selection", () => {
    for (const [id, s] of shapes) s.classList.toggle("selected", state.selection?.kind === "drawing" && state.selection.id === id);
  });
  state.on("tool", () => viewportEl.classList.toggle("tool-draw", state.tool.kind === "draw"));

  attachDrawSurface({
    svg: overEl,
    hostEl: viewportEl,
    toLocal: toWorld,
    getTool: () => (state.tool.kind === "draw" ? state.tool.tool : null),
    getColor: () => state.drawColor,
    getWidth: () => 3,
    onCommit: (d) => state.saveDrawing(d),
  });
}
