import { Point, Matrix } from '../types';

export const calculateAngle = (center: Point, point: Point): number => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  // Return angle in radians with 0 pointing right, positive going clockwise
  // Standard Math.atan2 returns angle with 0 pointing right, positive going counterclockwise
  // We flip the sign to make positive angles go clockwise (standard in computer graphics)
  return Math.atan2(dy, dx);
};

export const calculateDistance = (p1: Point, p2: Point): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const transformPoint = (point: Point, position: Point, rotation: number): Point => {
  // Expect rotation in radians now
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  return {
    x: dx * cos - dy * sin + position.x,
    y: dx * sin + dy * cos + position.y  // Fix: use position.y instead of position.x
  };
};

export const untransformPoint = (point: Point, position: Point, rotation: number): Point => {
  // Expect rotation in radians now
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  return {
    x: dx * cos - dy * sin + position.x,
    y: dx * sin + dy * cos + position.y  // Fix: use position.y instead of position.x
  };
};

export function computeTransformMatrix(
  dst0: Point, dst1: Point, dst2: Point, dst3: Point,
  src0: Point, src1: Point, src2: Point, src3: Point
): Matrix {
  function solveForGH(
    x0: number, x1: number, x2: number, x3: number,
    y0: number, y1: number, y2: number, y3: number
  ) {
    const A1 = x1 - x2;
    const B1 = x3 - x2;
    const C1 = x1 + x3 - x0 - x2;
    const A2 = y1 - y2;
    const B2 = y3 - y2;
    const C2 = y1 + y3 - y0 - y2;
    const denom = A1 * B2 - B1 * A2;
    if (Math.abs(denom) < 1e-12) {
      return { g: 0, h: 0 };
    }
    const g = (-C1 * B2 - (-C2) * B1) / denom;
    const h = (A1 * -C2 - A2 * -C1) / denom;
    return { g, h };
  }

  const x0 = src0.x, y0 = src0.y;
  const x1 = src1.x, y1 = src1.y;
  const x2 = src2.x, y2 = src2.y;
  const x3 = src3.x, y3 = src3.y;

  // Get g,h from source points
  const { g, h } = solveForGH(x0, x1, x2, x3, y0, y1, y2, y3);

  // Use destination points for matrix coefficients
  const a = dst1.x * (g + 1) - dst0.x;
  const b = dst3.x * (h + 1) - dst0.x;
  const c = dst0.x;
  const d = dst1.y * (g + 1) - dst0.y;
  const e = dst3.y * (h + 1) - dst0.y;
  const f = dst0.y;

  return { a, b, c, d, e, f, g, h };
}

export function transformImageData(
  H: Matrix,
  srcWidth: number,
  srcHeight: number,
  sData: Uint8ClampedArray,
  outWidth: number,
  outHeight: number
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outWidth;
  outputCanvas.height = outHeight;
  const outCtx = outputCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('Failed to get 2D context');
  }
  const output = outCtx.createImageData(outWidth, outHeight);
  const oData = output.data;

  function getBilinearSample(xx: number, yy: number): number[] {
    const x0 = Math.floor(xx), x1 = x0 + 1;
    const y0 = Math.floor(yy), y1 = y0 + 1;
    const dx = xx - x0, dy = yy - y0;
    if (x0 < 0 || y0 < 0 || x1 >= srcWidth || y1 >= srcHeight) {
      return [0, 0, 0, 255];
    }
    const i00 = (y0 * srcWidth + x0) * 4;
    const i01 = (y0 * srcWidth + x1) * 4;
    const i10 = (y1 * srcWidth + x0) * 4;
    const i11 = (y1 * srcWidth + x1) * 4;
    const c00 = [sData[i00], sData[i00 + 1], sData[i00 + 2], sData[i00 + 3]];
    const c01 = [sData[i01], sData[i01 + 1], sData[i01 + 2], sData[i01 + 3]];
    const c10 = [sData[i10], sData[i10 + 1], sData[i10 + 2], sData[i10 + 3]];
    const c11 = [sData[i11], sData[i11 + 1], sData[i11 + 2], sData[i11 + 3]];
    const top = [
      c00[0] * (1 - dx) + c01[0] * dx,
      c00[1] * (1 - dx) + c01[1] * dx,
      c00[2] * (1 - dx) + c01[2] * dx,
      c00[3] * (1 - dx) + c01[3] * dx
    ];
    const bottom = [
      c10[0] * (1 - dx) + c11[0] * dx,
      c10[1] * (1 - dx) + c11[1] * dx,
      c10[2] * (1 - dx) + c11[2] * dx,
      c10[3] * (1 - dx) + c11[3] * dx
    ];
    return [
      top[0] * (1 - dy) + bottom[0] * dy,
      top[1] * (1 - dy) + bottom[1] * dy,
      top[2] * (1 - dy) + bottom[2] * dy,
      top[3] * (1 - dy) + bottom[3] * dy
    ];
  }

  function transformPoint(H: Matrix, u: number, v: number): Point {
    const w = H.g * u + H.h * v + 1;
    if (Math.abs(w) < 1e-10) return { x: 0, y: 0 };
    return {
      x: (H.a * u + H.b * v + H.c) / w,
      y: (H.d * u + H.e * v + H.f) / w
    };
  }

  for (let j = 0; j < outHeight; j++) {
    const v = outHeight > 1 ? j / (outHeight - 1) : 0;
    for (let i = 0; i < outWidth; i++) {
      const u = outWidth > 1 ? i / (outWidth - 1) : 0;
      const { x, y } = transformPoint(H, u, v);
      const [rr, gg, bb, aa] = getBilinearSample(x, y);
      const outIdx = (j * outWidth + i) * 4;
      oData[outIdx] = Math.round(rr);
      oData[outIdx + 1] = Math.round(gg);
      oData[outIdx + 2] = Math.round(bb);
      oData[outIdx + 3] = Math.round(aa);
    }
  }
  outCtx.putImageData(output, 0, 0);
  return outputCanvas;
}

export function triangleArea(p1: Point, p2: Point, p3: Point): number {
  return Math.abs(
    (p2.x - p1.x) * (p3.y - p1.y) - 
    (p3.x - p1.x) * (p2.y - p1.y)
  ) / 2;
}

export function simplifyPoints(points: Point[], percentRemove: number): Point[] {
  if (points.length <= 3) return points;
  
  // Track areas and indices of all points
  const areas = new Map<number, number>();
  const indices = Array.from({ length: points.length }, (_, i) => i);
  
  // Calculate initial areas for all points in the closed path
  // For each point, calculate area of triangle formed with its neighbors
  for (let i = 0; i < points.length; i++) {
    const prev = (i - 1 + points.length) % points.length;
    const next = (i + 1) % points.length;
    const area = triangleArea(
      points[prev],
      points[i],
      points[next]
    );
    areas.set(i, area);
  }

  // Calculate how many points to remove while maintaining minimum of 3 points
  const targetLength = Math.max(3, Math.ceil(points.length * (1 - percentRemove/100)));
  const pointsToRemove = points.length - targetLength;

  // Iteratively remove points with smallest areas
  for (let i = 0; i < pointsToRemove; i++) {
    let minArea = Infinity;
    let minIndex = -1;
    
    // Find point creating smallest area
    for (const [idx, area] of areas) {
      if (area < minArea) {
        minArea = area;
        minIndex = idx;
      }
    }
    
    if (minIndex === -1) break;

    // Remove point and mark for deletion
    areas.delete(minIndex);
    indices[minIndex] = -1;
    
    // Update areas of adjacent points considering wrap-around
    const prev = (minIndex - 1 + points.length) % points.length;
    const next = (minIndex + 1) % points.length;
    
    // Recalculate area for previous point
    if (areas.has(prev)) {
      const prevPrev = (prev - 1 + points.length) % points.length;
      const area = triangleArea(
        points[prevPrev],
        points[prev],
        points[next]
      );
      areas.set(prev, area);
    }
    
    // Recalculate area for next point
    if (areas.has(next)) {
      const nextNext = (next + 1) % points.length;
      const area = triangleArea(
        points[prev],
        points[next],
        points[nextNext]
      );
      areas.set(next, area);
    }
  }

  // Return filtered points, removing marked indices
  return points.filter((_, i) => indices[i] !== -1);
}
