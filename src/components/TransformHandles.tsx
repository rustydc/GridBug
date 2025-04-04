import React, { useRef } from 'react';
import { Point, Bounds } from '../types';
import { useStore } from '../store';

interface Props {
  points?: Point[]; // Make points optional since RoundedRectOutline doesn't use them
  position: Point;
  rotation: number;
  onRotate: () => void; // Change the signature to match the actual usage
  bounds: Bounds;
  outlineId: string; // ID of the outline that owns these handles
  type?: 'spline' | 'roundedRect'; // Type of outline, used to determine which handles to show
}

const TransformHandles: React.FC<Props> = ({ bounds, position, onRotate, outlineId, type = 'spline' }) => {
  const { viewState, updateOutline } = useStore();
  const svgRef = useRef<SVGElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startBounds: Bounds;
    startPosition: Point;
    handlePosition: string;
  }>({
    startX: 0,
    startY: 0,
    startBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    startPosition: { x: 0, y: 0 },
    handlePosition: ''
  });
  
  // Base sizes that will be adjusted for zoom
  const handleBaseSize = 8;
  const rotateHandleBaseOffset = 20;
  const strokeBaseWidth = 1; // Base stroke width
  
  // Ensure zoom is valid (default to 1 if it's 0 or undefined)
  const effectiveZoomFactor = Math.max(0.1, viewState.zoom || 1);
  
  // Adjust sizes for current zoom
  const handleSize = handleBaseSize / effectiveZoomFactor;
  const rotateHandleOffset = rotateHandleBaseOffset / effectiveZoomFactor;
  const strokeWidth = strokeBaseWidth / effectiveZoomFactor;

  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Type assertion to SVGElement, then access ownerSVGElement
    const element = e.currentTarget as SVGElement;
    const svg = element.ownerSVGElement;
    if (!svg) return;
    
    // Tell the MainCanvas component to start rotate mode
    onRotate();
  };

  const handleMouseDown = (e: React.MouseEvent, handlePosition: string) => {
    e.stopPropagation();

    // Get SVG element
    const element = e.currentTarget as SVGElement;
    const svg = element.ownerSVGElement;
    if (!svg) return;

    svgRef.current = svg;

    // Convert mouse position to SVG coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // Store starting position and bounds
    dragRef.current = {
      startX: svgP.x,
      startY: svgP.y,
      startBounds: { ...bounds },
      startPosition: { ...position },
      handlePosition
    };

    // Add event listeners for drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!svgRef.current) return;

    const svg = svgRef.current as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const dx = svgP.x - dragRef.current.startX;
    const dy = svgP.y - dragRef.current.startY;

    // Calculate new position, width, and height based on which handle is being dragged
    let newBounds = { ...dragRef.current.startBounds };
    let newPosition = { ...dragRef.current.startPosition };
    const isAltPressed = e.altKey;
    
    // If alt is held, adjust symmetrically from center
    if (isAltPressed) {
      switch (dragRef.current.handlePosition) {
        case 'top':
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newBounds.maxY = dragRef.current.startBounds.maxY - dy;
          break;
        case 'right':
          newBounds.minX = dragRef.current.startBounds.minX - dx;
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          break;
        case 'bottom':
          newBounds.minY = dragRef.current.startBounds.minY - dy;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          break;
        case 'left':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.maxX = dragRef.current.startBounds.maxX - dx;
          break;
        case 'topLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.maxX = dragRef.current.startBounds.maxX - dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newBounds.maxY = dragRef.current.startBounds.maxY - dy;
          break;
        case 'topRight':
          newBounds.minX = dragRef.current.startBounds.minX - dx;
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newBounds.maxY = dragRef.current.startBounds.maxY - dy;
          break;
        case 'bottomRight':
          newBounds.minX = dragRef.current.startBounds.minX - dx;
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.minY = dragRef.current.startBounds.minY - dy;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          break;
        case 'bottomLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.maxX = dragRef.current.startBounds.maxX - dx;
          newBounds.minY = dragRef.current.startBounds.minY - dy;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          break;
      }
    } else {
      // Move just the handle that was dragged
      switch (dragRef.current.handlePosition) {
        case 'top':
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
        case 'right':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          break;
        case 'bottom':
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
        case 'left':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          break;
        case 'topLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
        case 'topRight':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
        case 'bottomRight':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
        case 'bottomLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition.x = dragRef.current.startPosition.x + dx / 2;
          newPosition.y = dragRef.current.startPosition.y + dy / 2;
          break;
      }
    }

    // Calculate new width and height
    const newWidth = Math.max(10, newBounds.maxX - newBounds.minX);
    const newHeight = Math.max(10, newBounds.maxY - newBounds.minY);

    // Use the outlineId passed in props to update the correct outline
    if (outlineId) {
      updateOutline(outlineId, {
        width: newWidth,
        height: newHeight,
        position: newPosition
      });
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Helper function to get cursor type based on handle position
  const getCursor = (position: string): string => {
    switch (position) {
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
      case 'topLeft':
      case 'bottomRight':
        return 'nwse-resize';
      case 'topRight':
      case 'bottomLeft':
        return 'nesw-resize';
      default:
        return 'move';
    }
  };

  return (
    <g>
      {/* Bounding box */}
      <rect
        x={bounds.minX}
        y={bounds.minY}
        width={width}
        height={height}
        fill="none"
        stroke="#2196f3"
        strokeWidth={strokeWidth}
        strokeDasharray={`${4/effectiveZoomFactor}`}
      />
      
      {/* Resize handles for rounded rectangles only */}
      {type === 'roundedRect' && (
        <>
          {/* Top left */}
          <rect
            x={bounds.minX - handleSize / 2}
            y={bounds.minY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('topLeft')}
            onMouseDown={(e) => handleMouseDown(e, 'topLeft')}
          />
          
          {/* Top */}
          <rect
            x={center.x - handleSize / 2}
            y={bounds.minY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('top')}
            onMouseDown={(e) => handleMouseDown(e, 'top')}
          />
          
          {/* Top right */}
          <rect
            x={bounds.maxX - handleSize / 2}
            y={bounds.minY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('topRight')}
            onMouseDown={(e) => handleMouseDown(e, 'topRight')}
          />
          
          {/* Right */}
          <rect
            x={bounds.maxX - handleSize / 2}
            y={center.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('right')}
            onMouseDown={(e) => handleMouseDown(e, 'right')}
          />
          
          {/* Bottom right */}
          <rect
            x={bounds.maxX - handleSize / 2}
            y={bounds.maxY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('bottomRight')}
            onMouseDown={(e) => handleMouseDown(e, 'bottomRight')}
          />
          
          {/* Bottom */}
          <rect
            x={center.x - handleSize / 2}
            y={bounds.maxY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('bottom')}
            onMouseDown={(e) => handleMouseDown(e, 'bottom')}
          />
          
          {/* Bottom left */}
          <rect
            x={bounds.minX - handleSize / 2}
            y={bounds.maxY - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('bottomLeft')}
            onMouseDown={(e) => handleMouseDown(e, 'bottomLeft')}
          />
          
          {/* Left */}
          <rect
            x={bounds.minX - handleSize / 2}
            y={center.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#2196f3"
            cursor={getCursor('left')}
            onMouseDown={(e) => handleMouseDown(e, 'left')}
          />
        </>
      )}
      
      {/* Rotate handle - always shown for both types */}
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