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

export type AnnotationKind = "update" | "contradiction";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  text: string;
  createdAt: number;
  infoDate?: string;
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
