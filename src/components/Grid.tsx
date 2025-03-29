import React from 'react';
import { useStore } from '../store';
import { calculateMinimalGridArea, GRID_SIZE, TOLERANCE } from '../utils/grid';

const CORNER_RADIUS = 7.5 / 2; // 7.5mm corner diameter
const HALF_TOLERANCE = TOLERANCE / 2; // Half of tolerance for adjusting each edge

const Grid: React.FC = () => {
  const { outlines } = useStore();
  const { min: gridMin, max: gridMax } = calculateMinimalGridArea(outlines);

  // Generate vertical and horizontal grid lines
  const verticalLines = [];
  const horizontalLines = [];
  
  for (let x = gridMin.x + GRID_SIZE - HALF_TOLERANCE; x <= gridMax.x - GRID_SIZE + HALF_TOLERANCE; x += GRID_SIZE) {
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

  for (let y = gridMin.y + GRID_SIZE - HALF_TOLERANCE; y <= gridMax.y - GRID_SIZE + HALF_TOLERANCE; y += GRID_SIZE) {
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