export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Case {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewport: Viewport;
}

export type AnnotationKind = "update" | "contradiction" | "custom";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** Nome do tipo (só para kind === "custom"), ex.: "Hipótese", "Álibi", "Fonte duvidosa". */
  label?: string;
  /** Cor da faixa/linha (só para kind === "custom"). */
  color?: string;
  text: string;
  createdAt: number;
  infoDate?: string;
  /** Posição/tamanho manual (px, relativo ao quadro pai). Ausente = posição automática. */
  dx?: number;
  dy?: number;
  w?: number;
  h?: number;
}

export type NodeType = "note" | "photos";

export interface BoardNode {
  id: string;
  caseId: string;
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color?: string;
  z: number;
  createdAt: number;
  infoDate?: string;
  photoIds: string[];
  annotations: Annotation[];
}

export interface Edge {
  id: string;
  caseId: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
}

export type DrawTool = "pen" | "ellipse" | "rect" | "arrow";

export interface Drawing {
  id: string;
  caseId: string;
  tool: DrawTool;
  points: number[];
  color: string;
  width: number;
}

export interface Photo {
  id: string;
  blob: Blob;
  /** Miniatura (≤ THUMB_MAX px) gerada uma vez; cards e grade usam ela, nunca o original. */
  thumb?: Blob;
  name: string;
  w: number;
  h: number;
  takenAt?: string;
  createdAt: number;
  marks: Drawing[];
}

export interface CaseData {
  nodes: BoardNode[];
  edges: Edge[];
  drawings: Drawing[];
}

export const uid = () => crypto.randomUUID();

export const ANNOT_COLORS: Record<Exclude<AnnotationKind, "custom">, string> = { update: "#e0b24a", contradiction: "#e05a4a" };

export function annotLabel(a: Pick<Annotation, "kind" | "label">): string {
  if (a.kind === "update") return "Atualização";
  if (a.kind === "contradiction") return "Contradição";
  return a.label?.trim() || "Anotação";
}

export function annotColor(a: Pick<Annotation, "kind" | "color">): string {
  return a.kind === "custom" ? a.color || "#4a90e0" : ANNOT_COLORS[a.kind];
}
