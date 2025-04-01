import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store';
import Grid from './Grid';
import Outline from './Outline';
import RoundedRectOutline from './RoundedRectOutline';
import { Point } from '../types';
import { transformPoint } from '../utils/geometry';

const MainCanvas: React.FC = () => {
  const { 
    viewState, 
    getViewBox, 
    setViewState, 
    zoomToPoint,
    outlines, 
    clearSelection, 
    updateOutline 
  } = useStore();
  
  // Get the calculated viewBox from the viewState
  const viewBox = getViewBox();
  
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


  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!e.shiftKey) {
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



  const handleDebugMouseMove = (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    (window as Window & { canvasCoords?: { x: number, y: number, screenX: number, screenY: number } }).canvasCoords = {
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
    
    // Store initial rotation - we still need this to calculate relative angle change
    setInitialRotation(outline.rotation);
    
    // Store initial position for reference
    setInitialPosition({ x: outline.position.x, y: outline.position.y });
    
    // Calculate center of bounds for the outline in its own coordinate space
    const centerX = (outline.bounds.minX + outline.bounds.maxX) / 2;
    const centerY = (outline.bounds.minY + outline.bounds.maxY) / 2;
    
    // Get center in canvas space using our transform function
    const centerCanvas = transformPoint({x: centerX, y: centerY}, outline.position, outline.rotation);
    
    // Get current mouse position and convert to canvas coordinates
    const ev = window.event as MouseEvent | undefined;
    if (!ev) return;
    
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const svgMatrix = svg.getScreenCTM()?.inverse();
    if (!svgMatrix) return;
    const mouseCanvas = pt.matrixTransform(svgMatrix);
    
    // Calculate initial angle in canvas space
    const initialAngle = calculateAngleFromVertical(centerCanvas, mouseCanvas);
    setInitialMouseAngle(initialAngle);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (svg) {
      const wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        const svg = svgRef.current;
        if (!svg) return;
        
        // Convert mouse position to SVG coordinates
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

        // Calculate new zoom factor
        const zoomDelta = 1 + e.deltaY * 0.001;
        const newZoom = viewState.zoom / zoomDelta;
        
        // Zoom to the point under the cursor
        zoomToPoint(newZoom, svgP);
      };
      
      svg.addEventListener('wheel', wheelHandler);
      return () => svg.removeEventListener('wheel', wheelHandler);
    }
  }, [viewState, zoomToPoint]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Handle panning
      if (panRef.current.active) {
        const svg = svgRef.current;
        if (!svg) return;

        // Convert the current and previous positions to SVG coordinates
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

        // Calculate the difference directly in SVG coordinates
        const dx = svgP1.x - svgP2.x;
        const dy = svgP1.y - svgP2.y;
        
        // Update the view state with the SVG coordinate differences
        setViewState({
          center: {
            x: viewState.center.x - dx,
            y: viewState.center.y - dy
          }
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
        
        // Get center in canvas space accounting for current rotation
        const centerCanvas = transformPoint({x: centerX, y: centerY}, outline.position, outline.rotation);
        
        // Convert mouse position from screen to canvas coordinates
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgMatrix = svg.getScreenCTM()?.inverse();
        if (!svgMatrix) return;
        const mouseCanvas = pt.matrixTransform(svgMatrix);
        
        // Calculate current angle in canvas space (not affected by rotation)
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
        
        updateOutline(rotatingOutlineId, { 
          rotation: newRotation,
          position: newPosition
        });
      }
    };
    
    const onMouseUp = () => {
      panRef.current.active = false;
      
      // End rotation mode
      if (rotatingOutlineId) {
        setRotatingOutlineId(null);
        setInitialMouseAngle(null);
        setInitialRotation(null);
        setInitialPosition(null);
      }
    };
    
    const onMouseLeave = () => {
      panRef.current.active = false;
      
      // End rotation mode
      if (rotatingOutlineId) {
        setRotatingOutlineId(null);
        setInitialMouseAngle(null);
        setInitialRotation(null);
        setInitialPosition(null);
      }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mousemove', handleDebugMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mousemove', handleDebugMouseMove);
    };
  }, [
    viewState.center.x, 
    viewState.center.y, 
    viewState.zoom, 
    rotatingOutlineId, 
    initialMouseAngle, 
    initialRotation, 
    initialPosition, 
    outlines,
    setViewState,
    updateOutline,
    calculateAngleFromVertical
    // transformPoint is imported from utils and doesn't change
  ]);

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
      {outlines.map(outline => {
        if (outline.type === 'roundedRect') {
          return (
            <RoundedRectOutline
              key={outline.id} 
              {...outline} 
              onRotateRequest={handleRotateRequest}
            />
          );
        } else {
          return (
            <Outline 
              key={outline.id} 
              {...outline} 
              onRotateRequest={handleRotateRequest}
            />
          );
        }
      })}
    </svg>
  )
};

export default MainCanvas;