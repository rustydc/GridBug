import { Point } from '../types';

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y
  };
}

export function sampleCurve(start: Point, cp1: Point, cp2: Point, end: Point, samples: number = 2): Point[] {
  const points: Point[] = [];
  for (let i = 1; i < samples; i++) {
    points.push(cubicBezierPoint(start, cp1, cp2, end, i/samples));
  }
  return points;
}

function parsePathCommands(pathD: string): Point[][] {
  const subpaths: Point[][] = [[]];
  let currentPath: Point[] = subpaths[0];
  const commands = pathD.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const type = cmd[0];
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(Number);

    switch (type.toUpperCase()) {
      case 'M': // Move to - starts a new subpath
        if (currentPath.length > 0) {
          currentPath = [];
          subpaths.push(currentPath);
        }
        currentX = type === type.toUpperCase() ? args[0] : currentX + args[0];
        currentY = type === type.toUpperCase() ? args[1] : currentY + args[1];
        currentPath.push({ x: currentX, y: currentY });
        // Additional points after M are treated as L commands
        for (let i = 2; i < args.length; i += 2) {
          currentX = type === type.toUpperCase() ? args[i] : currentX + args[i];
          currentY = type === type.toUpperCase() ? args[i + 1] : currentY + args[i + 1];
          currentPath.push({ x: currentX, y: currentY });
        }
        break;
      case 'L': // Line to
        for (let i = 0; i < args.length; i += 2) {
          currentX = type === type.toUpperCase() ? args[i] : currentX + args[i];
          currentY = type === type.toUpperCase() ? args[i + 1] : currentY + args[i + 1];
          currentPath.push({ x: currentX, y: currentY });
        }
        break;
      case 'C': // Cubic Bezier curve
        for (let i = 0; i < args.length; i += 6) {
          const x1 = type === 'C' ? args[i] : currentX + args[i];
          const y1 = type === 'C' ? args[i + 1] : currentY + args[i + 1];
          const x2 = type === 'C' ? args[i + 2] : currentX + args[i + 2];
          const y2 = type === 'C' ? args[i + 3] : currentY + args[i + 3];
          const endX = type === 'C' ? args[i + 4] : currentX + args[i + 4];
          const endY = type === 'C' ? args[i + 5] : currentY + args[i + 5];
          
          currentPath.push(cubicBezierPoint(
            { x: currentX, y: currentY },
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            { x: endX, y: endY },
            0.5
          ));
          currentX = endX;
          currentY = endY;
          currentPath.push({ x: currentX, y: currentY });
        }
        break;
      case 'H': // Horizontal line
        currentX = type === type.toUpperCase() ? args[0] : currentX + args[0];
        currentPath.push({ x: currentX, y: currentY });
        break;
      case 'V': // Vertical line
        currentY = type === type.toUpperCase() ? args[0] : currentY + args[0];
        currentPath.push({ x: currentX, y: currentY });
        break;
    }
  }

  // Filter out empty subpaths
  return subpaths.filter(path => path.length > 0);
}

export function pathToPoints(pathD: string): Point[][] {
  return parsePathCommands(pathD);
}