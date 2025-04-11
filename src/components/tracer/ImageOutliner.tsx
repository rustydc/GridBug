import React, { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { ImageInfo, Point } from '../../types';
import ObjectView from './ObjectView';
import PaperFinder from './PaperFinder';
import MaskOutline from './MaskOutline';

interface Props {
  image: ImageInfo;
  onClose: () => void;
  onConfirmOutline: (paths: Point[][], bitmap?: {
    url: string;
    width: number;
    height: number;
    position: Point;
  }) => void;
}

const ImageOutliner: React.FC<Props> = ({ image, onClose, onConfirmOutline }) => {
  const [currentImage, setCurrentImage] = useState(image);
  const [paperSize, setPaperSize] = useState<{width: number, height: number} | null>(null);
  const [boundsSizeMM, setBoundsSizeMM] = useState<{width: number, height: number} | null>(null);
  const [points, setPoints] = useState(() => {
    const w = image.width * 0.25; // 25% of width for padding
    const h = image.height * 0.25; // 25% of height for padding
    const centerX = image.width / 2;
    const centerY = image.height / 2;
    return [
      { x: centerX - w, y: centerY - h }, // top-left
      { x: centerX + w, y: centerY - h }, // top-right
      { x: centerX + w, y: centerY + h }, // bottom-right
      { x: centerX - w, y: centerY + h }, // bottom-left
    ];
  });

  const [mode, setMode] = useState<'paper' | 'bounds' | 'outline'>('paper');
  
  const handleBoundsConfirm = useCallback((bounds: { x: number, y: number, width: number, height: number }) => {
    // Create a new canvas to sample the bounded region
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set target size with aspect ratio preservation
    const scale = Math.min(1024 / bounds.width, 1024 / bounds.height);
    const outWidth = Math.round(bounds.width * scale);
    const outHeight = Math.round(bounds.height * scale);

    canvas.width = outWidth;
    canvas.height = outHeight;

    // Load and draw the bounded region
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(
        img,
        bounds.x, bounds.y, bounds.width, bounds.height,  // source rect
        0, 0, outWidth, outHeight                         // dest rect
      );

      if (paperSize) {
        setBoundsSizeMM({ width: paperSize.width * bounds.width / currentImage.width, height: paperSize.height * bounds.height / currentImage.height });
      }

      setCurrentImage({
        url: canvas.toDataURL(),
        width: outWidth,
        height: outHeight
      });
      setPoints([
        { x: 0, y: 0 },
        { x: outWidth, y: 0 },
        { x: outWidth, y: outHeight },
        { x: 0, y: outHeight }
      ]);
      setMode('outline');
    };
    img.src = currentImage.url;

  }, [currentImage, paperSize]);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
      {mode === 'paper' && (
        <PaperFinder
          image={currentImage}
          points={points}
          onClose={onClose}
          onConfirm={(paperSize) => {
            setPaperSize(paperSize);
            setMode('bounds');
          }}
          onPointsChange={setPoints}
          onTransformed={(newImage) => {
            setCurrentImage(newImage);
            setMode('bounds');
          }}
        />
      )}
      {mode === 'bounds' && (
        <ObjectView
          currentImage={currentImage}
          onObjectConfirm={handleBoundsConfirm}
          onClose={onClose}
        />
      )}
      {mode === 'outline' && boundsSizeMM && (
        <MaskOutline 
          image={currentImage} 
          mmPerPixel={boundsSizeMM.width / currentImage.width}
          onConfirmOutline={(paths, bitmap) => {
            if (!boundsSizeMM) return;

            // Scale paths to real-world coordinates
            for (const path of paths) {
              for (const p of path) {
                p.x = (p.x / currentImage.width) * boundsSizeMM.width;
                p.y = (p.y / currentImage.height) * boundsSizeMM.height;
              }
            }

            // Pass bitmap info with proper real-world dimensions
            onConfirmOutline(paths, bitmap && {
              ...bitmap,
              width: boundsSizeMM.width,
              height: boundsSizeMM.height,
            });
          }}
          onClose={onClose}
        />
      )}
    </Box>
  );
};

export default ImageOutliner;