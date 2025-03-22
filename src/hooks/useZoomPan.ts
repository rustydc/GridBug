
import { useState, useCallback, useEffect, useRef, RefObject } from 'react';

interface ZoomPanOptions {
  minZoom?: number;
  maxZoom?: number;
  wheelZoomFactor?: number;
}

interface ZoomPanResult {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  containerRef: RefObject<HTMLDivElement>;
  transform: string;
  handleWheel: (e: React.WheelEvent | WheelEvent) => void;
  handlePanStart: (e: React.MouseEvent | React.TouchEvent) => void;
  resetView: (contentWidth: number, contentHeight: number) => void;
  screenToContentCoords: (screenX: number, screenY: number) => { x: number, y: number };
}

export function useZoomPan({
  minZoom = 0.1,
  maxZoom = 10,
  wheelZoomFactor = 0.1
}: ZoomPanOptions = {}): ZoomPanResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const constrainPan = useCallback((newPan: { x: number, y: number }, newZoom: number, contentWidth: number, contentHeight: number) => {
    const container = containerRef.current;
    if (!container) return newPan;

    const contentWidthZoomed = contentWidth * newZoom;
    const contentHeightZoomed = contentHeight * newZoom;

    if (contentWidthZoomed < container.clientWidth) {
      newPan.x = (container.clientWidth - contentWidthZoomed) / 2;
    } else {
      newPan.x = Math.min(0, Math.max(container.clientWidth - contentWidthZoomed, newPan.x));
    }

    if (contentHeightZoomed < container.clientHeight) {
      newPan.y = (container.clientHeight - contentHeightZoomed) / 2;
    } else {
      newPan.y = Math.min(0, Math.max(container.clientHeight - contentHeightZoomed, newPan.y));
    }

    return newPan;
  }, []);

  const resetView = useCallback((contentWidth: number, contentHeight: number) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerAspect = container.clientWidth / container.clientHeight;
    const contentAspect = contentWidth / contentHeight;
    
    const newZoom = contentAspect > containerAspect
      ? container.clientWidth / contentWidth
      : container.clientHeight / contentHeight;

    setZoom(Math.max(minZoom, Math.min(maxZoom, newZoom)));

    // Center content
    setPan(constrainPan({ x: 0, y: 0 }, newZoom, contentWidth, contentHeight));
  }, [minZoom, maxZoom, constrainPan]);

  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    
    const container = containerRef.current;
    if (!container) return;

    const contentElement = container.firstElementChild as HTMLElement;
    if (!contentElement) return;
    
    const contentWidth = contentElement.offsetWidth / zoom;
    const contentHeight = contentElement.offsetHeight / zoom;

    const rect = container.getBoundingClientRect();
    const mouseX = ('clientX' in e) ? e.clientX - rect.left : 0;
    const mouseY = ('clientY' in e) ? e.clientY - rect.top : 0;

    const zoomFactor = ('deltaY' in e && e.deltaY !== 0) 
      ? (e.deltaY > 0 ? 1 - wheelZoomFactor : 1 + wheelZoomFactor) 
      : 1;

    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * zoomFactor));
    
    if (newZoom !== zoom) {
      const newPan = {
        x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (newZoom / zoom)
      };

      setPan(constrainPan(newPan, newZoom, contentWidth, contentHeight));
      setZoom(newZoom);
    }
  }, [zoom, pan, minZoom, maxZoom, wheelZoomFactor, constrainPan]);

  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length !== 1) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  }, [pan]);

  useEffect(() => {
    if (!isDragging) return;

    const container = containerRef.current;
    if (!container) return;

    const contentElement = container.firstElementChild as HTMLElement;
    if (!contentElement) return;
    
    const contentWidth = contentElement.offsetWidth / zoom;
    const contentHeight = contentElement.offsetHeight / zoom;

    const handlePanMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newPan = {
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      };

      setPan(constrainPan(newPan, zoom, contentWidth, contentHeight));
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

  // Helper to convert screen coordinates to content coordinates
  const screenToContentCoords = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom
    };
  }, [zoom, pan]);

  // Calculate CSS transform for the content
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return {
    zoom,
    pan,
    isDragging,
    containerRef,
    transform,
    handleWheel,
    handlePanStart,
    resetView,
    screenToContentCoords
  };
}