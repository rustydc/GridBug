import { Point } from '../types';

interface SVGDimensions {
  viewBox?: { x: number, y: number, width: number, height: number };
  width?: number;
  height?: number;
}

const parseDimension = (value: string | null): number | undefined => {
  if (!value) return undefined;
  return parseFloat(value.replace('px', ''));
};

const parseViewBox = (viewBox: string | null): SVGDimensions['viewBox'] | undefined => {
  if (!viewBox) return undefined;
  const [x, y, width, height] = viewBox.split(' ').map(Number);
  return { x, y, width, height };
};

const normalizePoint = (point: Point, dimensions: SVGDimensions): Point => {
  const viewBox = dimensions.viewBox || { x: 0, y: 0, width: 100, height: 100 };
  const width = dimensions.width || viewBox.width;
  const height = dimensions.height || viewBox.height;

  // Calculate scaling factors
  const scaleX = viewBox.width / width;
  const scaleY = viewBox.height / height;

  // Transform point
  return {
    x: (point.x - viewBox.x) / scaleX,
    y: (point.y - viewBox.y) / scaleY
  };
};

export const parseSVGPath = (d: string, svgElement?: SVGElement): Point[] => {
  // Get SVG dimensions
  const dimensions: SVGDimensions = {
    viewBox: svgElement ? parseViewBox(svgElement.getAttribute('viewBox')) : undefined,
    width: svgElement ? parseDimension(svgElement.getAttribute('width')) : undefined,
    height: svgElement ? parseDimension(svgElement.getAttribute('height')) : undefined
  };

  const points: Point[] = [];
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  let currentX = 0, currentY = 0;

  commands.forEach(cmd => {
    const type = cmd[0];
    const coords = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
    
    switch (type.toUpperCase()) {
      case 'M': // Move
        currentX = coords[0];
        currentY = coords[1];
        points.push(normalizePoint({ x: currentX, y: currentY }, dimensions));
        break;
      
      case 'L': // Line
        currentX = coords[0];
        currentY = coords[1];
        points.push(normalizePoint({ x: currentX, y: currentY }, dimensions));
        break;
      
      case 'C': // Cubic Bezier
        // Only take the end point, converting bezier to spline
        currentX = coords[4];
        currentY = coords[5];
        points.push(normalizePoint({ x: currentX, y: currentY }, dimensions));
        break;
      
      case 'Z': // Close path
        // Don't add closing point - the spline generator will handle closure
        break;
    }
  });

  return points;
};