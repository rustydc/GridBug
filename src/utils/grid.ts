import { Point, ViewBox, Outline } from '../types';
import { calculateSplineBounds } from './spline';
import { transformPoint } from './geometry';

export const GRID_SIZE = 42; // Changed to 42mm

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
    x: Math.floor(Math.min(...transformedBounds.map(b => b.minX)) / GRID_SIZE) * GRID_SIZE,
    y: Math.floor(Math.min(...transformedBounds.map(b => b.minY)) / GRID_SIZE) * GRID_SIZE
  };

  const max = {
    x: Math.ceil(Math.max(...transformedBounds.map(b => b.maxX)) / GRID_SIZE) * GRID_SIZE,
    y: Math.ceil(Math.max(...transformedBounds.map(b => b.maxY)) / GRID_SIZE) * GRID_SIZE
  };

  return { min, max };
};
