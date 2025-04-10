import { Point, Bounds } from '../types';
import { sampleCurve } from './svgPathParser';

export function catmullRomSpline(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  // Centripetal Catmull-Rom spline matrix
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
  
  return { x, y };
}

export function catmullToBezier(p0: Point, p1: Point, p2: Point, p3: Point): [Point, Point] {
  // Use α=0.5 for centripetal Catmull-Rom
  const getT = (p1: Point, p2: Point, alpha: number = 0.5): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.pow(dx * dx + dy * dy, alpha * 0.5);
  };

  const t0 = 0;
  const t1 = t0 + getT(p0, p1);
  const t2 = t1 + getT(p1, p2);
  const t3 = t2 + getT(p2, p3);

  // Convert Catmull-Rom to Bézier using time parameterization
  const cp1 = {
    x: p1.x + (p2.x - p0.x) * (t2 - t1) / (t2 - t0) / 3,
    y: p1.y + (p2.y - p0.y) * (t2 - t1) / (t2 - t0) / 3
  };
  const cp2 = {
    x: p2.x - (p3.x - p1.x) * (t2 - t1) / (t3 - t1) / 3,
    y: p2.y - (p3.y - p1.y) * (t2 - t1) / (t3 - t1) / 3
  };

  return [cp1, cp2];
}

export function generateSplinePath(points: Point[]): string {
  if (points.length < 2) return '';
  
  const segments: string[] = [];
  segments.push(`M ${points[0].x} ${points[0].y}`);

  // For a closed loop with n points, we need [n-1, 0, 1, ..., n-1, 0, 1]
  const allPoints = [
    points[points.length - 1],  // Last point
    ...points,                  // All points
    points[0],                  // First point again
    points[1]                   // Second point for final curve
  ];
  
  // Generate cubic Bézier curve segments for all points including closure
  for (let i = 1; i < allPoints.length - 2; i++) {
    const p0 = allPoints[i - 1];
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];
    const p3 = allPoints[i + 2];

    const [cp1, cp2] = catmullToBezier(p0, p1, p2, p3);
    segments.push(`C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`);
  }

  segments.push('Z');
  return segments.join(' ');
}

function solveCubicDerivativeZeros(a: number, b: number, c: number): number[] {
  // Handle degenerate cases where the curve becomes linear or quadratic
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return [];
    const t = -c / b;
    return t >= 0 && t <= 1 ? [t] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  
  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b + sqrtDisc) / (2 * a);
  const t2 = (-b - sqrtDisc) / (2 * a);
  
  return [t1, t2].filter(t => t >= 0 && t <= 1);
}

function evaluateCubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 
         3 * mt * mt * t * p1 + 
         3 * mt * t * t * p2 + 
         t * t * t * p3;
}

export function calculateSplineBounds(points: Point[]): Bounds {
  let bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  // Include original points
  points.forEach(p => {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  });

  const allPoints = [
    points[points.length - 1],
    ...points,
    points[0],
    points[1]
  ];

  // Check curve extremes
  for (let i = 1; i < allPoints.length - 2; i++) {
    const p0 = allPoints[i - 1];
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];
    const p3 = allPoints[i + 2];

    const [cp1, cp2] = catmullToBezier(p0, p1, p2, p3);

    // X-coordinate extremes
    const ax = 3 * (-p1.x + 3 * cp1.x - 3 * cp2.x + p2.x);
    const bx = 6 * (p1.x - 2 * cp1.x + cp2.x);
    const cx = 3 * (cp1.x - p1.x);
    
    solveCubicDerivativeZeros(ax, bx, cx).forEach(t => {
      const x = evaluateCubicBezier(p1.x, cp1.x, cp2.x, p2.x, t);
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
    });

    // Y-coordinate extremes
    const ay = 3 * (-p1.y + 3 * cp1.y - 3 * cp2.y + p2.y);
    const by = 6 * (p1.y - 2 * cp1.y + cp2.y);
    const cy = 3 * (cp1.y - p1.y);
    
    solveCubicDerivativeZeros(ay, by, cy).forEach(t => {
      const y = evaluateCubicBezier(p1.y, cp1.y, cp2.y, p2.y, t);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  }

  return bounds;
}

export function findClosestPointOnCurve(points: Point[], clickPoint: Point): { point: Point; segment: number; distance: number } {
  const allPoints = [
    points[points.length - 1],
    ...points,
    points[0],
    points[1]
  ];

  let closestPoint = { x: 0, y: 0 };
  let minDistance = Infinity;
  let bestSegment = 0;
  
  // Check each curve segment
  for (let i = 1; i < allPoints.length - 2; i++) {
    const p0 = allPoints[i - 1];
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];
    const p3 = allPoints[i + 2];

    const [cp1, cp2] = catmullToBezier(p0, p1, p2, p3);
    
    // Sample points along the curve
    const curvePoints = [p1, ...sampleCurve(p1, cp1, cp2, p2, 20), p2];
    
    for (const point of curvePoints) {
      const distance = Math.hypot(point.x - clickPoint.x, point.y - clickPoint.y);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
        bestSegment = i - 1;
      }
    }
  }

  return { 
    point: closestPoint,
    segment: bestSegment,
    distance: minDistance
  };
}