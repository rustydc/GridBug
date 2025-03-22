import { Outline, Point } from '../types';
import { calculateMinimalGridArea } from './grid';
import { generateSplinePath } from './spline';

const transformPoint = (point: Point, outline: Outline, origin: Point): Point => {
  const rad = outline.rotation * Math.PI / 180;
  const x = point.x * Math.cos(rad) - point.y * Math.sin(rad) + outline.position.x;
  const y = point.x * Math.sin(rad) + point.y * Math.cos(rad) + outline.position.y;
  
  // Points are already in mm, just translate relative to origin
  return {
    x: (x - origin.x),
    y: (y - origin.y)
  };
};

export const generateSVG = (outlines: Outline[]): string => {
  const { min, max } = calculateMinimalGridArea(outlines);
  // min and max are already in mm
  const width = max.x - min.x;
  const height = max.y - min.y;
  
  const paths = outlines.map(outline => {
    const points = outline.points.map(p => transformPoint(p, outline, min));
    const pathData = generateSplinePath(points);
    return `<path d="${pathData}" fill="${outline.color}" fill-opacity="0.2" stroke="${outline.color}"/>`;
  });

  // No need to multiply, values are already in mm
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">
  ${paths.join('\n  ')}
</svg>`;
};