import React, { useRef, useState, useEffect } from 'react';
import { Point, Bounds } from '../../types';
import { useStore } from '../../store';
import { transformPoint } from '../../utils/geometry';

interface Props {
  position: Point;
  rotation: number;
  bounds: Bounds;
  outlineId: string; // ID of the outline that owns these handles
}

const RotationHandles: React.FC<Props> = ({ bounds, position, rotation, outlineId }) => {
  const { viewState, updateOutline } = useStore();
  const svgRef = useRef<SVGElement | null>(null);
  
  // Rotation state
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [initialMouseAngle, setInitialMouseAngle] = useState<number | null>(null);
  const [initialRotation, setInitialRotation] = useState<number | null>(null);
  const [initialPosition, setInitialPosition] = useState<Point | null>(null);
  
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

  // Helper function to calculate angle from y-axis (0 degrees points up)
  const calculateAngleFromVertical = React.useCallback((center: Point, point: Point): number => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    
    // Calculate angle in radians where 0 is up (negative y-axis)
    // Math.atan2 returns angle where 0 is right (positive x-axis)
    // So we subtract PI/2 (90 degrees) to make 0 point up
    let angle = Math.atan2(dy, dx) - Math.PI / 2;
    
    // Convert to degrees
    angle = angle * (180 / Math.PI);
    
    // Normalize angle to 0-360 range
    if (angle < 0) angle += 360;
    
    return angle;
  }, []);

  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Type assertion to SVGElement, then access ownerSVGElement
    const element = e.currentTarget as SVGElement;
    const svg = element.ownerSVGElement;
    if (!svg) return;
    
    svgRef.current = svg;
    
    // Start rotation mode
    setIsRotating(true);
    
    // Store initial rotation - needed to calculate relative angle change
    setInitialRotation(rotation);
    
    // Store initial position for reference
    setInitialPosition({ x: position.x, y: position.y });
    
    // Calculate center of bounds for the outline in its own coordinate space
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Get center in canvas space using transform function
    const centerCanvas = transformPoint({x: centerX, y: centerY}, position, rotation);
    
    // Convert mouse position to SVG coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgMatrix = svg.getScreenCTM()?.inverse();
    if (!svgMatrix) return;
    const mouseCanvas = pt.matrixTransform(svgMatrix);
    
    // Calculate initial angle in canvas space
    const initialAngle = calculateAngleFromVertical(centerCanvas, mouseCanvas);
    setInitialMouseAngle(initialAngle);
    
    // Event listeners are added in the useEffect based on isRotating state
  };

  const handleRotateMove = React.useCallback((e: MouseEvent) => {
    if (!isRotating || !svgRef.current || initialMouseAngle === null || 
        initialRotation === null || initialPosition === null) {
      return;
    }
    
    // Use the stored SVG reference
    const svg = svgRef.current as SVGSVGElement;
    
    // Calculate center of bounds for the outline in its own coordinate space
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Get center in canvas space accounting for current rotation
    const centerCanvas = transformPoint({x: centerX, y: centerY}, position, rotation);
    
    // Convert mouse position from screen to canvas coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgMatrix = svg.getScreenCTM()?.inverse();
    if (!svgMatrix) return;
    const mouseCanvas = pt.matrixTransform(svgMatrix);
    
    // Calculate current angle in canvas space
    const currentAngle = calculateAngleFromVertical(centerCanvas, mouseCanvas);
    
    // Calculate angle delta from initial mouse angle
    let angleDelta = currentAngle - initialMouseAngle;
    
    // Normalize angle delta to avoid jumps when crossing 0/360 boundary
    if (angleDelta > 180) angleDelta -= 360;
    if (angleDelta < -180) angleDelta += 360;
    
    // Calculate new absolute rotation
    const newRotation = initialRotation + angleDelta;
    
    // Calculate where the origin (0,0) was before rotation (in canvas space)
    const oldOriginX = initialPosition.x;
    const oldOriginY = initialPosition.y;
    
    // Use centerCanvas from above for consistent math
    const localCenter = {
      x: centerX,
      y: centerY
    };
    
    // Transform to canvas space accounting for initial rotation
    const centerCanvasInitial = transformPoint(localCenter, initialPosition, initialRotation);
    
    // Calculate the angle change in radians
    const angleChangeRad = ((newRotation - initialRotation) * Math.PI) / 180;
    
    // Calculate where the origin should be after rotation around the center
    // We're rotating the vector from center to origin
    const originOffsetX = oldOriginX - centerCanvasInitial.x;
    const originOffsetY = oldOriginY - centerCanvasInitial.y;
    
    const cos = Math.cos(angleChangeRad);
    const sin = Math.sin(angleChangeRad);
    
    // Apply rotation matrix to the offset vector
    const rotatedOffsetX = originOffsetX * cos - originOffsetY * sin;
    const rotatedOffsetY = originOffsetX * sin + originOffsetY * cos;
    
    // New origin position = center + rotated offset
    const newPosition = {
      x: centerCanvasInitial.x + rotatedOffsetX,
      y: centerCanvasInitial.y + rotatedOffsetY
    };
    
    // Update the outline with the new rotation and position
    updateOutline(outlineId, { 
      rotation: newRotation,
      position: newPosition
    });
  }, [isRotating, bounds, position, rotation, outlineId, updateOutline, initialMouseAngle, initialRotation, initialPosition, calculateAngleFromVertical]);

  const handleRotateEnd = React.useCallback(() => {
    setIsRotating(false);
  }, []);
  
  // Effect to handle rotation events
  useEffect(() => {
    if (isRotating) {
      // Set cursor for the entire document during rotation
      const originalCursor = document.body.style.cursor;
      document.body.style.cursor = 'grabbing';
      
      document.addEventListener('mousemove', handleRotateMove);
      document.addEventListener('mouseup', handleRotateEnd);
      
      return () => {
        // Restore original cursor
        document.body.style.cursor = originalCursor;
        
        document.removeEventListener('mousemove', handleRotateMove);
        document.removeEventListener('mouseup', handleRotateEnd);
      };
    } else if (initialMouseAngle !== null) {
      // Clean up state when rotation is complete
      setInitialMouseAngle(null);
      setInitialRotation(null);
      setInitialPosition(null);
    }
  }, [isRotating, handleRotateMove, handleRotateEnd, initialMouseAngle]);

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
      
      {/* Rotate handle */}
      <line
        x1={center.x}
        y1={bounds.minY}
        x2={center.x}
        y2={bounds.minY - rotateHandleOffset}
        stroke="#2196f3"
        strokeWidth={strokeWidth}
        strokeDasharray={`${4/effectiveZoomFactor}`}
      />
      <circle
        cx={center.x}
        cy={bounds.minY - rotateHandleOffset}
        r={handleSize/2}
        fill="#2196f3"
        cursor={isRotating ? "grabbing" : "grab"}
        onMouseDown={handleRotateStart}
      />
    </g>
  );
};

export default RotationHandles;