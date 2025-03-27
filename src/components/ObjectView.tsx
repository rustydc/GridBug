import React, { useState, useEffect } from 'react';
import { Box, Button } from '@mui/material';
import { ImageInfo } from '../types';
import ZoomableSvgView, { useZoomContext } from './ZoomableSvgView';

interface Props {
  currentImage: ImageInfo;
  onObjectConfirm: (bounds: { x: number, y: number, width: number, height: number }) => void;
  onClose: () => void;
}

const ObjectView: React.FC<Props> = ({ currentImage, onObjectConfirm, onClose }) => {
  const [selectedRect, setSelectedRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  const handleConfirm = () => {
    if (selectedRect) {
      onObjectConfirm(selectedRect);
    }
  };

  // Inner component for selection overlay
  const SelectionOverlay = () => {
    const { zoom, screenToImageCoords } = useZoomContext();
    const [rect, setRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
    const [isDraggingRect, setIsDraggingRect] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
      console.log("Click!")
      if (e.button !== 0) return; // Only process left clicks
      e.stopPropagation(); // Don't trigger pan
      
      const { x: imageX, y: imageY } = screenToImageCoords(e.clientX, e.clientY);
      
      setIsDraggingRect(true);
      setDragStart({ x: imageX, y: imageY });
      setRect({
        x: imageX,
        y: imageY,
        width: 0,
        height: 0
      });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      const { x: imageX, y: imageY } = screenToImageCoords(e.clientX, e.clientY);
      
      setCursorPos({ x: imageX, y: imageY });

      if (isDraggingRect && rect) {
        setRect({
          x: Math.min(dragStart.x, imageX),
          y: Math.min(dragStart.y, imageY),
          width: Math.abs(imageX - dragStart.x),
          height: Math.abs(imageY - dragStart.y)
        });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRect && rect && rect.width > 0 && rect.height > 0) {
        setSelectedRect(rect);
      }
      setIsDraggingRect(false);
    };

    useEffect(() => {
      if (isDraggingRect) {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
      }
    }, [isDraggingRect, rect]);

    const rectToDraw = rect || selectedRect;

    return (
      <g 
        onMouseDown={handleMouseDown} 
        onMouseMove={handleMouseMove}
        style={{ cursor: 'crosshair', pointerEvents: 'bounding-box' as React.CSSProperties['pointerEvents'] }}
      >
        {rectToDraw && (
          <rect
            x={rectToDraw.x}
            y={rectToDraw.y}
            width={rectToDraw.width}
            height={rectToDraw.height}
            fill="rgba(0, 100, 255, 0.2)"
            stroke="rgb(0, 100, 255)"
            strokeWidth={2 / zoom}
          />
        )}
        <line
          x1={0}
          y1={cursorPos.y}
          x2={currentImage.width}
          y2={cursorPos.y}
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth={1 / zoom}
          strokeDasharray={`${4 / zoom},${4 / zoom}`}
        />
        <line
          x1={cursorPos.x}
          y1={0}
          x2={cursorPos.x}
          y2={currentImage.height}
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth={1 / zoom}
          strokeDasharray={`${4 / zoom},${4 / zoom}`}
        />
      </g>
    );
  };

  return (
    <>
      <ZoomableSvgView image={currentImage}>
        <SelectionOverlay />
      </ZoomableSvgView>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleConfirm}
          disabled={!selectedRect}
        >
          Confirm bounds
        </Button>
      </Box>
    </>
  );
};

export default ObjectView;