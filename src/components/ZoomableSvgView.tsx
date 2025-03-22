import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { Box } from '@mui/material';
import { ImageInfo } from '../types';

interface ZoomContextType {
  zoom: number;
  pan: { x: number; y: number };
  screenToImageCoords: (screenX: number, screenY: number) => { x: number, y: number };
}

const ZoomContext = createContext<ZoomContextType>({
  zoom: 1,
  pan: { x: 0, y: 0 },
  screenToImageCoords: () => ({ x: 0, y: 0 }),
});

export const useZoomContext = () => useContext(ZoomContext);

interface Props {
  image: ImageInfo;
  children?: React.ReactNode;
  onPanStart?: (e: React.MouseEvent | React.TouchEvent) => void; // Optional callback for custom pan start handling
}

const ZoomableSvgView: React.FC<Props> = ({ image, children, onPanStart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset view to fit image
  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const containerAspect = container.clientWidth / container.clientHeight;
    const imageAspect = image.width / image.height;
    
    const newFitZoom = imageAspect > containerAspect
      ? container.clientWidth / image.width
      : container.clientHeight / image.height;

    setFitZoom(newFitZoom);
    setZoom(newFitZoom);

    // Center image in container
    setPan({
      x: (container.clientWidth - image.width * newFitZoom) / 2,
      y: (container.clientHeight - image.height * newFitZoom) / 2
    });
  }, [image.width, image.height]);

  // Initialize zoom and pan when image changes
  useEffect(() => {
    resetView();
  }, [image.url, image.width, image.height, resetView]);

  // Helper to constrain pan within reasonable limits
  const constrainPan = useCallback((newPan: { x: number, y: number }, newZoom: number) => {
    const container = containerRef.current;
    if (!container) return newPan;

    // Calculate fit window dimensions
    const containerAspect = container.clientWidth / container.clientHeight;
    const imageAspect = image.width / image.height;
    
    const fitWidth = imageAspect > containerAspect
      ? container.clientWidth
      : container.clientHeight * imageAspect;
    
    const fitHeight = imageAspect > containerAspect
      ? container.clientWidth / imageAspect
      : container.clientHeight;

    // Get the margins when image is fit
    const fitMarginX = (container.clientWidth - fitWidth) / 2;
    const fitMarginY = (container.clientHeight - fitHeight) / 2;

    // Constrain pan to fit window boundaries
    newPan.x = Math.min(
      fitMarginX,
      Math.max(-(image.width * newZoom - fitWidth - fitMarginX), newPan.x)
    );
    newPan.y = Math.min(
      fitMarginY,
      Math.max(-(image.height * newZoom - fitHeight - fitMarginY), newPan.y)
    );

    return newPan;
  }, [image.width, image.height]);

  // Handle wheel events for zooming
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(fitZoom, Math.min(fitZoom * 20, zoom * zoomFactor));
    
    // Adjust pan to keep mouse position fixed
    const newPan = {
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom)
    };

    setPan(zoomFactor < 1 ? constrainPan(newPan, newZoom) : newPan);
    setZoom(newZoom);
  }, [zoom, pan, constrainPan, fitZoom]);

  // Handle pan start
  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length !== 1) return;
    
    // If the consumer wants to handle pan start
    if (onPanStart) onPanStart(e);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  }, [pan, onPanStart]);

  // Handle pan move and end
  useEffect(() => {
    if (!isDragging) return;

    const handlePanMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newPan = {
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      };

      setPan(constrainPan(newPan, zoom));
    };

    const handlePanEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handlePanMove, { passive: false });
    window.addEventListener('mouseup', handlePanEnd);
    window.addEventListener('touchmove', handlePanMove, { passive: false });
    window.addEventListener('touchend', handlePanEnd);

    return () => {
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
      window.removeEventListener('touchmove', handlePanMove);
      window.removeEventListener('touchend', handlePanEnd);
    };
  }, [isDragging, dragStart, zoom, constrainPan]);

  // Set up wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Screen coordinates to image coordinates conversion
  const screenToImageCoords = useCallback((screenX: number, screenY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom
    };
  }, [zoom, pan]);

  // Context value to share with children
  const zoomContextValue = {
    zoom,
    pan,
    screenToImageCoords
  };

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <ZoomContext.Provider value={zoomContextValue}>
        <svg
          width="100%"
          height="100%"
          style={{ 
            backgroundColor: '#f0f0f0', 
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={handlePanStart}
          onTouchStart={handlePanStart}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <image
              href={image.url}
              width={image.width}
              height={image.height}
            />
            {children}
          </g>
        </svg>
      </ZoomContext.Provider>
    </Box>
  );
};

export default ZoomableSvgView;