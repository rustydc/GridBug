
import React from 'react';
import { useStore } from '../store';
import { GRID_SIZE } from '../utils/grid';
import { ViewBox } from '../types';

const generateGridLines = (viewBox: ViewBox) => {
  const lines: { x: number; y: number }[] = [];
  const startX = Math.floor(viewBox.x / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(viewBox.y / GRID_SIZE) * GRID_SIZE;
  const endX = Math.ceil((viewBox.x + viewBox.width) / GRID_SIZE) * GRID_SIZE;
  const endY = Math.ceil((viewBox.y + viewBox.height) / GRID_SIZE) * GRID_SIZE;

  for (let x = startX; x <= endX; x += GRID_SIZE) {
    lines.push({ x, y: 0 });
  }

  for (let y = startY; y <= endY; y += GRID_SIZE) {
    lines.push({ x: 0, y });
  }

  return lines;
};

const GridComponent: React.FC = () => {
  const { viewBox } = useStore();
  const lines = generateGridLines(viewBox);

  return (
    <g>
      {lines.map(({ x, y }, index) => (
        <line
          key={`grid-${index}`}
          x1={x}
          y1={y === 0 ? viewBox.y : y}
          x2={x}
          y2={y === 0 ? viewBox.y + viewBox.height : y}
          x3={y === 0 ? viewBox.x : x}
          y3={y}
          x4={y === 0 ? viewBox.x + viewBox.width : x}
          y4={y}
          stroke="#ddd"
          strokeWidth="1"
        />
      ))}
    </g>
  );
};

export default GridComponent;