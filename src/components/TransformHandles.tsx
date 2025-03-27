import React from 'react';
import { Point, Bounds } from '../types';
import { useStore } from '../store';

interface Props {
  points: Point[];
  position: Point;
  rotation: number;
  onRotate: (angle: number) => void;
  bounds: Bounds;
}

const TransformHandles: React.FC<Props> = ({ bounds, onRotate, rotation }) => {
  const { zoomFactor } = useStore();
  
  // Base sizes that will be adjusted for zoom
  const handleBaseSize = 8;
  const rotateHandleBaseOffset = 20;
  const strokeBaseWidth = 1; // Base stroke width
  
  // Ensure zoomFactor is valid (default to 1 if it's 0 or undefined)
  const effectiveZoomFactor = Math.max(0.1, zoomFactor || 1);
  
  // Adjust sizes for current zoom
  const handleSize = handleBaseSize / effectiveZoomFactor;
  const rotateHandleOffset = rotateHandleBaseOffset / effectiveZoomFactor;
  const strokeWidth = strokeBaseWidth / effectiveZoomFactor;

  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };

  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Type assertion to SVGElement, then access ownerSVGElement
    const element = e.currentTarget as SVGElement;
    const svg = element.ownerSVGElement;
    if (!svg) return;
    
    // Tell the MainCanvas component to start rotate mode
    onRotate(-999); // Signal to start rotation mode
  };

  return (
    <g>
      {/* Bounding box */}
      <rect
        x={bounds.minX}
        y={bounds.minY}
        width={bounds.maxX - bounds.minX}
        height={bounds.maxY - bounds.minY}
        fill="none"
        stroke="#2196f3"
        strokeWidth={strokeWidth}
        strokeDasharray={`${4/effectiveZoomFactor}`}
      />
      
      {/* Rotate handle - always pointing up in local coordinate space */}
      <circle
        cx={center.x}
        cy={bounds.minY - rotateHandleOffset}
        r={handleSize/2}
        fill="#2196f3"
        cursor="crosshair"
        onMouseDown={handleRotateStart}
      />
      <line
        x1={center.x}
        y1={bounds.minY}
        x2={center.x}
        y2={bounds.minY - rotateHandleOffset}
        stroke="#2196f3"
        strokeWidth={strokeWidth}
        strokeDasharray={`${4/effectiveZoomFactor}`}
      />
    </g>
  );
};

export default TransformHandles;