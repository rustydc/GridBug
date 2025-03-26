import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store';
import Grid from './Grid';
import Outline from './Outline';
import { Point } from '../types';

const MainCanvas: React.FC = () => {
  const { viewBox, setViewBox, outlines, clearSelection, setZoomFactor, updateOutline } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0
  });
  const [rotatingOutlineId, setRotatingOutlineId] = useState<string | null>(null);
  const [initialMouseAngle, setInitialMouseAngle] = useState<number | null>(null);
  const [initialRotation, setInitialRotation] = useState<number | null>(null);
  const [initialPosition, setInitialPosition] = useState<Point | null>(null);

  // Helper function to calculate angle from y-axis (0 degrees points up)
  const calculateAngleFromVertical = (center: Point, point: Point): number => {
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
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const zoomFactor = 1 + e.deltaY * 0.001;
    
    // Get current scale from SVG matrix to update the global zoomFactor
    const ctm = svg.getScreenCTM();
    if (ctm) {
      setZoomFactor(ctm.a / zoomFactor);
    }
    
    setViewBox({
      width: viewBox.width * zoomFactor,
      height: viewBox.height * zoomFactor,
      x: svgP.x - (svgP.x - viewBox.x) * zoomFactor,
      y: svgP.y - (svgP.y - viewBox.y) * zoomFactor
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === svgRef.current && !e.shiftKey) {
      clearSelection();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) { // Middle or right click
      e.preventDefault();
      panRef.current = {
        active: true,
        lastX: e.clientX,
        lastY: e.clientY
      };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    // Handle panning
    if (panRef.current.active) {
      const svg = svgRef.current;
      if (!svg) return;

      const pt1 = svg.createSVGPoint();
      const pt2 = svg.createSVGPoint();
      
      pt1.x = e.clientX;
      pt1.y = e.clientY;
      pt2.x = panRef.current.lastX;
      pt2.y = panRef.current.lastY;

      const svgMatrix = svg.getScreenCTM()?.inverse();
      if (!svgMatrix) return;
      
      const svgP1 = pt1.matrixTransform(svgMatrix);
      const svgP2 = pt2.matrixTransform(svgMatrix);

      const dx = svgP1.x - svgP2.x;
      const dy = svgP1.y - svgP2.y;

      setViewBox({
        ...viewBox,
        x: viewBox.x - dx,
        y: viewBox.y - dy
      });

      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
    }
    
    // Handle rotation
    if (rotatingOutlineId) {
      const svg = svgRef.current;
      if (!svg) return;
      
      const outline = outlines.find(o => o.id === rotatingOutlineId);
      if (!outline || initialMouseAngle === null || initialRotation === null || initialPosition === null) return;
      
      // Calculate center of bounds for the outline in its own coordinate space
      const centerX = (outline.bounds.minX + outline.bounds.maxX) / 2;
      const centerY = (outline.bounds.minY + outline.bounds.maxY) / 2;
      
      // Convert center to global coordinate space
      const centerPoint = svg.createSVGPoint();
      centerPoint.x = outline.position.x + centerX;
      centerPoint.y = outline.position.y + centerY;
      
      // Convert to screen coordinates
      const screenCTM = svg.getScreenCTM();
      if (!screenCTM) return;
      
      const centerScreen = centerPoint.matrixTransform(screenCTM);
      
      // Current mouse position in screen coordinates
      const mousePoint = { x: e.clientX, y: e.clientY };
      
      // Calculate current angle in screen space
      const currentAngle = calculateAngleFromVertical({ x: centerScreen.x, y: centerScreen.y }, mousePoint);
      
      // Calculate angle delta from initial mouse angle
      let angleDelta = currentAngle - initialMouseAngle;
      
      // Normalize angle delta to avoid jumps when crossing 0/360 boundary
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;
      
      // Calculate new absolute rotation
      const newRotation = initialRotation + angleDelta;
      
      // When we change rotation while keeping it around the origin (0,0),
      // we need to adjust position to make it appear to rotate around the center
      
      // Calculate how the center point would move when rotated around origin
      // For initial rotation
      const initialRotationRad = initialRotation * Math.PI / 180;
      const initialCenterRotatedX = centerX * Math.cos(initialRotationRad) - centerY * Math.sin(initialRotationRad);
      const initialCenterRotatedY = centerX * Math.sin(initialRotationRad) + centerY * Math.cos(initialRotationRad);
      
      // For new rotation
      const newRotationRad = newRotation * Math.PI / 180;
      const newCenterRotatedX = centerX * Math.cos(newRotationRad) - centerY * Math.sin(newRotationRad);
      const newCenterRotatedY = centerX * Math.sin(newRotationRad) + centerY * Math.cos(newRotationRad);
      
      // Calculate the position adjustment needed
      const adjustX = newCenterRotatedX - initialCenterRotatedX;
      const adjustY = newCenterRotatedY - initialCenterRotatedY;
      
      // Update the outline with the new rotation and adjusted position
      // Starting from initialPosition ensures we don't accumulate errors
      updateOutline(rotatingOutlineId, { 
        rotation: newRotation,
        position: {
          x: initialPosition.x - adjustX,
          y: initialPosition.y - adjustY
        }
      });
      
      // Debug logs for position adjustment
      console.log('Position Adjustment:', {
        centerX,
        centerY,
        initialRotationRad: initialRotationRad.toFixed(2),
        newRotationRad: newRotationRad.toFixed(2),
        adjustX: adjustX.toFixed(2),
        adjustY: adjustY.toFixed(2),
        initialPosition: {
          x: initialPosition.x.toFixed(2),
          y: initialPosition.y.toFixed(2)
        },
        newPosition: {
          x: (initialPosition.x - adjustX).toFixed(2),
          y: (initialPosition.y - adjustY).toFixed(2)
        }
      });
      
      // Debug logs
      console.log('Rotation:', {
        currentAngle,
        initialAngle: initialMouseAngle,
        delta: angleDelta,
        newRotation
      });
    }
  };

  const handleMouseUp = () => {
    panRef.current.active = false;
    
    // End rotation mode
    if (rotatingOutlineId) {
      setRotatingOutlineId(null);
      setInitialMouseAngle(null);
      setInitialRotation(null);
      setInitialPosition(null);
    }
  };

  const handleMouseLeave = () => {
    panRef.current.active = false;
    
    // End rotation mode
    if (rotatingOutlineId) {
      setRotatingOutlineId(null);
      setInitialMouseAngle(null);
      setInitialRotation(null);
      setInitialPosition(null);
    }
  };

  const handleDebugMouseMove = (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    (window as any).canvasCoords = {
      x: svgP.x,
      y: svgP.y,
      screenX: e.clientX,
      screenY: e.clientY
    };
  };

  // Start rotation mode for an outline
  const handleRotateRequest = (outlineId: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    
    const outline = outlines.find(o => o.id === outlineId);
    if (!outline) return;
    
    // We'll start rotation mode and track mouse moves in the canvas
    setRotatingOutlineId(outlineId);
    
    // Store initial rotation and position
    setInitialRotation(outline.rotation);
    setInitialPosition({ x: outline.position.x, y: outline.position.y });
    
    // Calculate center of bounds for the outline in its own coordinate space
    const centerX = (outline.bounds.minX + outline.bounds.maxX) / 2;
    const centerY = (outline.bounds.minY + outline.bounds.maxY) / 2;
    
    // Convert center to global coordinate space
    const centerPoint = svg.createSVGPoint();
    centerPoint.x = outline.position.x + centerX;
    centerPoint.y = outline.position.y + centerY;
    
    // Convert to screen coordinates
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return;
    
    const centerScreen = centerPoint.matrixTransform(screenCTM);
    
    // Current mouse position in screen coordinates
    // Using MouseEvent properties for a more type-safe approach
    const ev = window.event as MouseEvent | undefined;
    const mousePoint = { x: ev?.clientX || 0, y: ev?.clientY || 0 };
    
    // Calculate initial angle in screen space
    const initialAngle = calculateAngleFromVertical({ x: centerScreen.x, y: centerScreen.y }, mousePoint);
    setInitialMouseAngle(initialAngle);
    
    console.log('Starting rotation:', {
      outlineId,
      initialRotation: outline.rotation,
      initialMouseAngle: initialAngle,
      centerScreen: { x: centerScreen.x, y: centerScreen.y },
      mouseScreen: mousePoint
    });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (svg) {
      svg.addEventListener('wheel', handleWheel);
      return () => svg.removeEventListener('wheel', handleWheel);
    }
  }, [viewBox]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mousemove', handleDebugMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mousemove', handleDebugMouseMove);
    };
  }, [viewBox, rotatingOutlineId, initialMouseAngle, initialRotation, initialPosition]);

  // Initial zoom factor calculation on component mount
  useEffect(() => {
    const svg = svgRef.current;
    if (svg) {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        setZoomFactor(ctm.a);
      }
    }
  }, [viewBox]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={{ 
        backgroundColor: '#f0f0f0', 
        cursor: panRef.current.active ? 'grabbing' : rotatingOutlineId ? 'crosshair' : 'default' 
      }}
      onClick={handleCanvasClick}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Grid />
      {outlines.map(outline => (
        <Outline 
          key={outline.id} 
          {...outline} 
          onRotateRequest={handleRotateRequest}
        />
      ))}
    </svg>
  )
};

export default MainCanvas;