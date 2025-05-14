import { Point, Outline, SplineOutline, RoundedRectOutline } from '../types';
import { calculateSplineBounds } from './spline';
import { transformPoint } from './geometry';

export const GRID_SIZE = 42; // 42mm grid size
export const TOLERANCE = 0.5; // 0.5mm tolerance for grid boundaries

export const snapToGrid = (point: Point): Point => {
  return {
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE
  };
};

export const calculateMinimalGridArea = (outlines: Outline[]): { min: Point; max: Point } => {
  if (outlines.length === 0) {
    return { min: { x: 0, y: 0 }, max: { x: GRID_SIZE - TOLERANCE, y: GRID_SIZE - TOLERANCE } };
  }

  // For each outline, get the bounds in canvas space
  const transformedBounds = outlines.map(outline => {
    const { position, rotation } = outline;
    
    if (outline.type === 'spline') {
      const splineOutline = outline as SplineOutline;
      // Transform the points to canvas space
      const transformedPoints = splineOutline.points.map(point => 
        transformPoint(point, position, rotation)
      );
      
      // Calculate bounds directly from the transformed points
      return calculateSplineBounds(transformedPoints);
    } else {
      // For rounded rectangles, calculate bounds considering corner radius
      const roundedRect = outline as RoundedRectOutline;
      const { width, height, radius } = roundedRect;
      
      // Calculate the center points of the four corner arcs (in local coordinates)
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      
      // Corner arc centers are inset from the rectangle corners by the radius
      const cornerCenters = [
        // Top-left corner arc center
        { x: -halfWidth + radius, y: -halfHeight + radius },
        // Top-right corner arc center
        { x: halfWidth - radius, y: -halfHeight + radius },
        // Bottom-right corner arc center
        { x: halfWidth - radius, y: halfHeight - radius },
        // Bottom-left corner arc center
        { x: -halfWidth + radius, y: halfHeight - radius }
      ];
      
      // Transform the corner centers to canvas space
      const transformedCenters = cornerCenters.map(center => 
        transformPoint(center, position, rotation)
      );
      
      // Find the min/max x and y values of the transformed centers
      const centerMinX = Math.min(...transformedCenters.map(p => p.x));
      const centerMinY = Math.min(...transformedCenters.map(p => p.y));
      const centerMaxX = Math.max(...transformedCenters.map(p => p.x));
      const centerMaxY = Math.max(...transformedCenters.map(p => p.y));
      
      // Simply add/subtract the radius to get the actual bounds
      return {
        minX: centerMinX - radius,
        minY: centerMinY - radius,
        maxX: centerMaxX + radius,
        maxY: centerMaxY + radius
      };
    }
  });
  
  const min = {
    x: Math.min(...transformedBounds.map(b => b.minX)),
    y: Math.min(...transformedBounds.map(b => b.minY))
  }
  const max = {
    x: Math.max(...transformedBounds.map(b => b.maxX)),
    y: Math.max(...transformedBounds.map(b => b.maxY))
  }


  const minGrid = {
    x: Math.floor((min.x - TOLERANCE / 2) / GRID_SIZE) * GRID_SIZE + TOLERANCE / 2,
    y: Math.floor((min.y - TOLERANCE / 2) / GRID_SIZE) * GRID_SIZE + TOLERANCE / 2
  };
  const maxGrid = {
    x: Math.ceil((max.x + TOLERANCE / 2) / GRID_SIZE) * GRID_SIZE - TOLERANCE / 2,
    y: Math.ceil((max.y + TOLERANCE / 2) / GRID_SIZE) * GRID_SIZE - TOLERANCE / 2
  };

  return { min: minGrid, max: maxGrid };
};
