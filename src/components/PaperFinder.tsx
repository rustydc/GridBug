import React, { useState, useCallback } from 'react';
import { Box, Button, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { ImageInfo } from '../types';
import { computeTransformMatrix, transformImageData } from '../utils/geometry';
import ZoomableSvgView, { useZoomContext } from './ZoomableSvgView';

const PAPER_SIZES = {
  'Letter': { width: 215.9, height: 279.4 }, // mm (8.5" x 11")
  'A4': { width: 210, height: 297 }, // mm
  '3x5': { width: 76.2, height: 127 }, // mm (3" x 5")
};

const MM_TO_PIXELS = 11.811; // 300 DPI conversion

// This component will be used inside ZoomableSvgView
const PaperOverlay: React.FC<{
  points: Array<{ x: number; y: number }>;
  onPointsChange: (points: Array<{ x: number; y: number }>) => void;
  imageWidth: number;
  imageHeight: number;
}> = ({ points, onPointsChange, imageWidth, imageHeight }) => {
  const { zoom, screenToImageCoords } = useZoomContext();

  const handleDragPoint = (index: number, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    
    const updatePoint = (moveEvent: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const { x, y } = screenToImageCoords(clientX, clientY);

      onPointsChange(points.map((p, i) => 
        i === index ? {
          x: Math.max(0, Math.min(imageWidth, x)),
          y: Math.max(0, Math.min(imageHeight, y))
        } : p
      ));
    };

    if ('touches' in e) {
      const update = (e: TouchEvent) => updatePoint(e);
      const cleanup = () => {
        window.removeEventListener('touchmove', update);
        window.removeEventListener('touchend', cleanup);
      };
      window.addEventListener('touchmove', update);
      window.addEventListener('touchend', cleanup);
    } else {
      const update = (e: MouseEvent) => updatePoint(e);
      const cleanup = () => {
        window.removeEventListener('mousemove', update);
        window.removeEventListener('mouseup', cleanup);
      };
      window.addEventListener('mousemove', update);
      window.addEventListener('mouseup', cleanup);
    }
  };

  return (
    <>
      <polygon
        points={points.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(0, 100, 255, 0.2)"
        stroke="rgb(0, 100, 255)"
        strokeWidth={2 / zoom}
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={6 / zoom}
          fill="white"
          stroke="rgb(0, 100, 255)"
          strokeWidth={2 / zoom}
          cursor="move"
          onMouseDown={(e) => handleDragPoint(index, e)}
          onTouchStart={(e) => handleDragPoint(index, e)}
        />
      ))}
    </>
  );
};

interface Props {
  image: ImageInfo;
  points: Array<{ x: number; y: number }>;
  onClose: () => void;
  onConfirm: (paperSize: {width: number, height: number}) => void;
  onPointsChange: (points: Array<{ x: number; y: number }>) => void;
  onTransformed: (newImage: ImageInfo) => void;
}

const PaperFinder: React.FC<Props> = ({
  image,
  points,
  onClose,
  onConfirm,
  onPointsChange,
  onTransformed
}) => {
  const [paperSize, setPaperSize] = useState<keyof typeof PAPER_SIZES>('Letter');

  const handleConfirm = useCallback(() => {
    const paperDims = PAPER_SIZES[paperSize];
    const scale = Math.min(1024 / (paperDims.width * MM_TO_PIXELS), 1024 / (paperDims.height * MM_TO_PIXELS));
    const outWidth = Math.round(paperDims.width * MM_TO_PIXELS * scale);
    const outHeight = Math.round(paperDims.height * MM_TO_PIXELS * scale);
    
    // Points order: top-left, top-right, bottom-right, bottom-left
    const matrix = computeTransformMatrix(
      points[0],                // src0: input top-left
      points[1],                // src1: input top-right
      points[2],                // src2: input bottom-right
      points[3],                // src3: input bottom-left
      {x: 0, y: 0},             // dst0: output top-left
      {x: outWidth, y: 0},      // dst1: output top-right
      {x: outWidth, y: outHeight}, // dst2: output bottom-right
      {x: 0, y: outHeight}      // dst3: output bottom-left    
    );

    // Rest of the function remains the same
    // Create temporary image to get ImageData
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      
      const transformedCanvas = transformImageData(
        matrix,
        img.width,
        img.height,
        imageData.data,
        outWidth,
        outHeight
      );
      
      onTransformed({
        url: transformedCanvas.toDataURL(),
        width: outWidth,
        height: outHeight
      });
      onConfirm(paperDims);
    };
    img.src = image.url;
  }, [image, points, paperSize, onConfirm, onTransformed]);

  return (
    <>
      <ZoomableSvgView image={image}>
        <PaperOverlay 
          points={points} 
          onPointsChange={onPointsChange}
          imageWidth={image.width}
          imageHeight={image.height}
        />
      </ZoomableSvgView>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Paper Size</InputLabel>
          <Select
            value={paperSize}
            label="Paper Size"
            onChange={(e) => setPaperSize(e.target.value as keyof typeof PAPER_SIZES)}
          >
            {Object.entries(PAPER_SIZES).map(([size]) => (
              <MenuItem key={size} value={size}>
                {size}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm}>
          Confirm Paper
        </Button>
      </Box>
    </>
  );
};

export default PaperFinder;
export { PAPER_SIZES };