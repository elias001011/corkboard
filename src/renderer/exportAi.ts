import { firstTitle } from "./markdown";
import { formatDate } from "./modal";
import { state } from "./state";
import { annotLabel, type BoardNode, type Drawing, type Edge, type Photo } from "./types";
import { saveBlob } from "./save";
import { ZipWriter } from "./zip";

const pad = (n: number) => String(n).padStart(2, "0");
const href = (s: string) => encodeURI(s).replace(/\(/g, "%28").replace(/\)/g, "%29");
const MARK_NAMES: Record<Drawing["tool"], string> = { pen: "traço livre", ellipse: "círculo", rect: "retângulo", arrow: "seta" };

function safeName(s: string, max = 60): string {
  const cleaned = s.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "sem titulo").slice(0, max).trim();
}

function nodeTitle(n: BoardNode): string {
  const t = firstTitle(n.text).replace(/[*_=~`]/g, "").trim();
  if (t) return t;
  return n.type === "photos" ? "Quadro de fotos" : "Sem título";
}

function extOf(p: Photo): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(p.name);
  if (m) return m[1].toLowerCase();
  const t = p.blob.type.split("/")[1];
  return t === "jpeg" ? "jpg" : t || "png";
}

function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function bodyMarkdown(text: string): string {
  const lines = text.split("\n");
  if (lines[0] && /^#{1,3}\s+/.test(lines[0])) lines.shift();
  return lines.join("\n").trim();
}

async function renderMarked(p: Photo): Promise<Blob | null> {
  if (!p.marks.length) return null;
  const img = new Image();
  img.src = state.photoUrl(p.id);
  await img.decode().catch(() => {});
  const c = document.createElement("canvas");
  c.width = p.w || img.naturalWidth;
  c.height = p.h || img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const m of p.marks) {
    const q = m.points;
    g.strokeStyle = m.color;
    g.lineWidth = m.width;
    g.beginPath();
    if (m.tool === "pen") {
      g.moveTo(q[0], q[1]);
      for (let i = 2; i < q.length; i += 2) g.lineTo(q[i], q[i + 1]);
    } else if (m.tool === "ellipse") {
      g.ellipse((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, Math.abs(q[2] - q[0]) / 2, Math.abs(q[3] - q[1]) / 2, 0, 0, Math.PI * 2);
    } else if (m.tool === "rect") {
      g.rect(Math.min(q[0], q[2]), Math.min(q[1], q[3]), Math.abs(q[2] - q[0]), Math.abs(q[3] - q[1]));
    } else {
      const [x1, y1, x2, y2] = q;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.max(10, m.width * 4);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.moveTo(x2, y2);
      g.lineTo(x2 + len * Math.cos(ang + Math.PI * 0.8), y2 + len * Math.sin(ang + Math.PI * 0.8));
      g.moveTo(x2, y2);
      g.lineTo(x2 + len * Math.cos(ang - Math.PI * 0.8), y2 + len * Math.sin(ang - Math.PI * 0.8));
    }
    g.stroke();
  }
  return new Promise((r) => c.toBlob((b) => r(b), "image/png"));
}

interface Numbered {
  n: BoardNode;
  num: string;
  title: string;
  file: string;
}

export async function exportForAi() {
  const c = state.currentCase;
  if (!c) return;
  const nodes = [...state.nodes.values()].sort((a, b) => a.createdAt - b.createdAt || a.y - b.y || a.x - b.x);
  const edges = [...state.edges.values()];
  const numbered = new Map<string, Numbered>();
  nodes.forEach((n, i) => {
    const num = pad(i + 1);
    const title = nodeTitle(n);
    numbered.set(n.id, { n, num, title, file: `${num} - ${safeName(title)}.md` });
  });

  // Endpoints de ligação podem ser quadros ("03") ou anotações subjetivas ("03.2").
  const owner = new Map<string, string>();
  const refOf = (id: string): Numbered | undefined => {
    const direct = numbered.get(id);
    if (direct) return direct;
    const parentId = owner.get(id);
    const parent = parentId ? numbered.get(parentId) : undefined;
    if (!parent) return undefined;
    const i = parent.n.annotations.findIndex((a) => a.id === id);
    const a = parent.n.annotations[i];
    return { n: parent.n, num: `${parent.num}.${i + 1}`, title: `${annotLabel(a)} de ${parent.title}`, file: parent.file };
  };
  for (const { n } of numbered.values()) for (const a of n.annotations) owner.set(a.id, n.id);
  const belongs = (id: string, nodeId: string) => id === nodeId || owner.get(id) === nodeId;

  const zip = new ZipWriter();
  const root = safeName(c.name);
  const readme: string[] = [];
  const all: string[] = [];

  readme.push(`# ${c.name}`, "", `Exportado do Corkboard em ${new Date().toLocaleString("pt-BR")}.`, `Investigação criada em ${formatDate(c.createdAt)}, última edição em ${formatDate(c.updatedAt)}.`, "");
  readme.push("## Como ler", "", "- Cada quadro do painel virou um arquivo em `quadros/`, numerado na ordem em que foi criado.", "- Sub-itens `NN.1`, `NN.2`… são **anotações subjetivas** presas ao quadro: *Atualização* = informação nova que substitui/complementa; *Contradição* = fato que conflita com o quadro; outros nomes são tipos criados pelo investigador.", "- `Data de criação` = quando o quadro foi escrito. `Data da informação` = de quando é o fato em si.", "- As imagens estão em `imagens/`, prefixadas pelo número do quadro. Versões `(marcado)` têm os círculos/setas desenhados por cima.", "- `CASO COMPLETO.md` junta tudo num arquivo só, para colar num chat.", "");

  readme.push("## Quadros", "");
  for (const { n, num, title, file } of numbered.values()) {
    const kind = n.type === "photos" ? `fotos (${n.photoIds.length})` : "anotação";
    const extra = n.annotations.length ? `, ${n.annotations.length} anotação(ões) subjetiva(s)` : "";
    readme.push(`- ${num} — [${title}](quadros/${href(file)}) — ${kind}${extra}`);
  }
  readme.push("");

  if (edges.length) {
    readme.push("## Ligações", "");
    for (const e of edges) {
      const a = refOf(e.from), b = refOf(e.to);
      if (!a || !b) continue;
      readme.push(`- ${a.num} ${a.title} → ${b.num} ${b.title}${e.label ? ` — *${e.label}*` : ""}`);
    }
    readme.push("", "```mermaid", "graph LR");
    for (const { n, num, title } of numbered.values()) {
      readme.push(`  Q${num}["${num} ${title.replace(/"/g, "'")}"]`);
      n.annotations.forEach((a, i) => {
        if (!edges.some((e) => e.from === a.id || e.to === a.id)) return;
        readme.push(`  Q${num}_${i + 1}(["${num}.${i + 1} ${annotLabel(a).replace(/"/g, "'")}"])`);
        readme.push(`  Q${num} -.- Q${num}_${i + 1}`);
      });
    }
    for (const e of edges) {
      const a = refOf(e.from), b = refOf(e.to);
      if (a && b) readme.push(`  Q${a.num.replace(".", "_")} -->${e.label ? `|${e.label.replace(/\|/g, "/")}|` : ""} Q${b.num.replace(".", "_")}`);
    }
    readme.push("```", "");
  }

  for (const { n, num, title, file } of numbered.values()) {
    const md: string[] = [];
    md.push(`# ${num} — ${title}`, "");
    md.push(`- Tipo: ${n.type === "photos" ? "quadro de fotos" : "anotação"}`);
    md.push(`- Data de criação: ${formatDate(n.createdAt)}`);
    if (n.infoDate) md.push(`- Data da informação: ${n.infoDate}`);
    md.push("");
    const body = bodyMarkdown(n.text);
    if (body) md.push(body, "");

    if (n.type === "photos") {
      md.push("## Imagens", "");
      let k = 0;
      for (const pid of n.photoIds) {
        const p = state.photos.get(pid);
        if (!p) continue;
        k++;
        const base = `${num}-${k} - ${safeName(stripExt(p.name), 40)}`;
        const orig = `${base}.${extOf(p)}`;
        await zip.add(`${root}/imagens/${orig}`, p.blob);
        md.push(`![${orig}](../imagens/${href(orig)})`);
        md.push(`- Arquivo: \`imagens/${orig}\``);
        if (p.takenAt) md.push(`- Data da foto: ${p.takenAt}`);
        if (p.marks.length) {
          const marked = `${base} (marcado).png`;
          const blob = await renderMarked(p);
          if (blob) await zip.add(`${root}/imagens/${marked}`, blob);
          const summary = p.marks.map((m) => MARK_NAMES[m.tool]).join(", ");
          md.push(`- Marcações feitas pelo investigador: ${summary} → ver \`imagens/${marked}\``);
          md.push(`![${marked}](../imagens/${href(marked)})`);
        }
        md.push("");
      }
    }

    if (n.annotations.length) {
      n.annotations.forEach((a, i) => {
        md.push(`## ${num}.${i + 1} — ${annotLabel(a)}${a.kind === "custom" ? " (tipo personalizado)" : ""}`, "");
        md.push(`- Data de criação: ${formatDate(a.createdAt)}`);
        if (a.infoDate) md.push(`- Data da informação: ${a.infoDate}`);
        md.push("", a.text.trim() || "*(vazio)*", "");
      });
    }

    const out = edges.filter((e) => belongs(e.from, n.id)), inc = edges.filter((e) => belongs(e.to, n.id));
    if (out.length || inc.length) {
      md.push("## Ligações", "");
      const line = (e: Edge, self: Numbered, other: Numbered, dir: "→" | "←") =>
        `- ${self.num !== num ? `(${self.num}) ` : ""}${dir} [${other.num} — ${other.title}](${href(other.file)})${e.label ? ` — *${e.label}*` : ""}`;
      for (const e of out) {
        const me = refOf(e.from), o = refOf(e.to);
        if (me && o) md.push(line(e, me, o, "→"));
      }
      for (const e of inc) {
        const me = refOf(e.to), o = refOf(e.from);
        if (me && o) md.push(line(e, me, o, "←"));
      }
      md.push("");
    }

    const text = md.join("\n");
    await zip.add(`${root}/quadros/${file}`, text);
    all.push(text.replace(/\]\(\.\.\/imagens\//g, "](imagens/").replace(/\]\((\d\d%20-%20[^)]+\.md)\)/g, "](quadros/$1)"));
  }

  const readmeText = readme.join("\n");
  await zip.add(`${root}/README.md`, readmeText);
  await zip.add(`${root}/CASO COMPLETO.md`, [readmeText, "", "---", "", all.join("\n\n---\n\n")].join("\n"));

  const d = new Date();
  const name = `${root} - export IA ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}.zip`;
  await saveBlob(zip.finish(), name, [{ name: "ZIP", extensions: ["zip"] }]);
}
