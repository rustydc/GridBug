import React, { useRef } from 'react';
import { Point, Bounds } from '../types';
import { useStore } from '../store';

interface Props {
  position: Point;
  rotation: number;
  bounds: Bounds;
  outlineId: string; // ID of the outline that owns these handles
}

const RectTransformHandles: React.FC<Props> = ({ bounds, position, rotation, outlineId }) => {
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
  const strokeBaseWidth = 1; // Base stroke width
  
  // Ensure zoom is valid (default to 1 if it's 0 or undefined)
  const effectiveZoomFactor = Math.max(0.1, viewState.zoom || 1);
  
  // Adjust sizes for current zoom
  const handleSize = handleBaseSize / effectiveZoomFactor;
  const strokeWidth = strokeBaseWidth / effectiveZoomFactor;

  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

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

    // Convert the mouse movement to the rotated coordinate system
    // First, calculate raw movement in screen space
    const rawDx = svgP.x - dragRef.current.startX;
    const rawDy = svgP.y - dragRef.current.startY;
    
    // Adjust for rotation - convert screen coordinates to object's local coordinate system
    const rad = (-rotation * Math.PI) / 180; // Convert to radians and invert
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // Apply rotation transformation to the delta
    const dx = rawDx * cos - rawDy * sin;
    const dy = rawDx * sin + rawDy * cos;

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
          // Calculate position adjustment accounting for rotation
          newPosition = calculatePositionAdjustment(dx, dy, 0, dy/2, rotation, dragRef.current.startPosition);
          break;
        case 'right':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, 0, rotation, dragRef.current.startPosition);
          break;
        case 'bottom':
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition = calculatePositionAdjustment(dx, dy, 0, dy/2, rotation, dragRef.current.startPosition);
          break;
        case 'left':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, 0, rotation, dragRef.current.startPosition);
          break;
        case 'topLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, dy/2, rotation, dragRef.current.startPosition);
          break;
        case 'topRight':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.minY = dragRef.current.startBounds.minY + dy;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, dy/2, rotation, dragRef.current.startPosition);
          break;
        case 'bottomRight':
          newBounds.maxX = dragRef.current.startBounds.maxX + dx;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, dy/2, rotation, dragRef.current.startPosition);
          break;
        case 'bottomLeft':
          newBounds.minX = dragRef.current.startBounds.minX + dx;
          newBounds.maxY = dragRef.current.startBounds.maxY + dy;
          newPosition = calculatePositionAdjustment(dx, dy, dx/2, dy/2, rotation, dragRef.current.startPosition);
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
  
  // Helper function to calculate the new position after a resize, accounting for rotation
  const calculatePositionAdjustment = (
    dx: number, 
    dy: number, 
    offsetX: number, 
    offsetY: number, 
    rotation: number,
    startPosition: Point
  ): Point => {
    // Convert rotation to radians
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // Calculate position adjustment in rotated space
    // This transforms the offset vector by the rotation matrix
    const adjustedX = offsetX * cos - offsetY * sin;
    const adjustedY = offsetX * sin + offsetY * cos;
    
    return {
      x: startPosition.x + adjustedX,
      y: startPosition.y + adjustedY
    };
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
    </g>
  );
};

export default RectTransformHandles;