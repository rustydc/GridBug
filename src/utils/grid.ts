import { Point, ViewBox, Outline } from '../types';

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

  const min = {
    x: Math.floor(Math.min(...outlines.map(o => o.bounds.minX + o.position.x)) / GRID_SIZE) * GRID_SIZE,
    y: Math.floor(Math.min(...outlines.map(o => o.bounds.minY + o.position.y)) / GRID_SIZE) * GRID_SIZE
  };

  const max = {
    x: Math.ceil(Math.max(...outlines.map(o => o.bounds.maxX + o.position.x)) / GRID_SIZE) * GRID_SIZE,
    y: Math.ceil(Math.max(...outlines.map(o => o.bounds.maxY + o.position.y)) / GRID_SIZE) * GRID_SIZE
  };

  return { min, max };
};
