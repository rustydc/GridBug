export interface Point {
  x: number;
  y: number;
}

// Base interface with common properties
export interface BaseOutline {
  id: string;
  type: 'spline' | 'roundedRect';
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

// Spline-specific outline (points-based)
export interface SplineOutline extends BaseOutline {
  type: 'spline';
  points: Point[];
}

// Rounded rectangle outline
export interface RoundedRectOutline extends BaseOutline {
  type: 'roundedRect';
  width: number;
  height: number;
  radius: number;
}

// Union type for all outline types
export type Outline = SplineOutline | RoundedRectOutline;

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