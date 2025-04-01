import { Point, Outline } from '../types';
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
    return { min: { x: 0, y: 0 }, max: { x: GRID_SIZE, y: GRID_SIZE } };
  }

  // For each outline, transform the points to canvas space and calculate bounds
  const transformedBounds = outlines.map(outline => {
    const { points, position, rotation } = outline;
    
    // Transform the points to canvas space
    const transformedPoints = points.map(point => transformPoint(point, position, rotation));
    
    // Calculate bounds directly from the transformed points
    return calculateSplineBounds(transformedPoints);
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
