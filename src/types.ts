export interface Point {
  x: number;
  y: number;
}

export interface Outline {
  id: string;
  points: Point[];
  position: Point;
  rotation: number;
  selected: boolean;
  editMode: boolean;
  color: string;  // hex color
  bounds: Bounds;
  bitmap?: {
    url: string;
    width: number;
    height: number;
    position: Point;  // Relative to outline origin
  };
}

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number; }

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewState {
  center: Point;
  zoom: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ImageInfo {
  url: string;
  width: number;
  height: number;
}