import React, { useRef, useEffect } from 'react';
import { useStore } from '../store';
import Grid from './Grid';
import Outline from './Outline';
import RoundedRectOutline from './RoundedRectOutline';

const MainCanvas: React.FC = () => {
  const { 
    viewState, 
    getViewBox, 
    setViewState, 
    zoomToPoint,
    outlines, 
    clearSelection
  } = useStore();
  
  // Get the calculated viewBox from the viewState
  const viewBox = getViewBox();
  
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0
  });


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

  // Rotation is now handled directly in the TransformHandles component

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
    };
    
    const onMouseUp = () => {
      panRef.current.active = false;
    };
    
    const onMouseLeave = () => {
      panRef.current.active = false;
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
    setViewState
  ]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={{ 
        backgroundColor: '#f0f0f0', 
        cursor: panRef.current.active ? 'grabbing' : 'inherit' 
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
            />
          );
        } else {
          return (
            <Outline 
              key={outline.id} 
              {...outline}
            />
          );
        }
      })}
    </svg>
  )
};

export default MainCanvas;