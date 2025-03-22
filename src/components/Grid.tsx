import React from 'react';
import { useStore } from '../store';
import { calculateMinimalGridArea } from '../utils/grid';

const GRID_SIZE = 42; // 42mm grid size
const CORNER_RADIUS = 7.5 / 2; // 7.5mm corner diameter

const Grid: React.FC = () => {
  const { outlines } = useStore();
  const { min, max } = calculateMinimalGridArea(outlines);
  
  // Extend min/max to nearest grid lines
  const gridMin = {
    x: Math.floor(min.x / GRID_SIZE) * GRID_SIZE,
    y: Math.floor(min.y / GRID_SIZE) * GRID_SIZE
  };
  const gridMax = {
    x: Math.ceil(max.x / GRID_SIZE) * GRID_SIZE,
    y: Math.ceil(max.y / GRID_SIZE) * GRID_SIZE
  };

  // Generate vertical and horizontal grid lines
  const verticalLines = [];
  const horizontalLines = [];
  
  for (let x = gridMin.x + GRID_SIZE; x <= gridMax.x - GRID_SIZE; x += GRID_SIZE) {
    verticalLines.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={gridMin.y}
        x2={x}
        y2={gridMax.y}
        stroke="#aaa"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  for (let y = gridMin.y + GRID_SIZE; y <= gridMax.y - GRID_SIZE; y += GRID_SIZE) {
    horizontalLines.push(
      <line
        key={`h${y}`}
        x1={gridMin.x}
        y1={y}
        x2={gridMax.x}
        y2={y}
        stroke="#aaa"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <>
      <rect
        x={gridMin.x}
        y={gridMin.y}
        width={gridMax.x - gridMin.x}
        height={gridMax.y - gridMin.y}
        rx={CORNER_RADIUS}
        ry={CORNER_RADIUS}
        fill="white"
        stroke="#aaa"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
      {verticalLines}
      {horizontalLines}
    </>
  );
};

export default Grid;