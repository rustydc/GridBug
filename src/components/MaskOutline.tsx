import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Button, CircularProgress, Typography, Slider } from '@mui/material';
import { ImageInfo, Point } from '../types';
import Potrace from '../utils/potrace';
import { pathToPoints } from '../utils/svgPathParser';
import ZoomableSvgView, { useZoomContext } from './ZoomableSvgView';
import { generateSplinePath } from '../utils/spline';
import { simplifyPoints } from '../utils/geometry';

// This component will be used inside ZoomableSvgView
const MaskOverlay: React.FC<{
  maskUrl: string | null;
  contours: Point[][];  // Changed from svgPaths to contours
  positivePoints: Point[];
  negativePoints: Point[];
  onAddPoint: (point: Point, isPositive: boolean) => void;
  imageWidth: number;
  imageHeight: number;
  simplification: number;
}> = ({ maskUrl, contours, positivePoints, negativePoints, onAddPoint, imageWidth, imageHeight, simplification }) => {
  const { zoom, screenToImageCoords } = useZoomContext();

  // Calculate a stroke width that maintains visual consistency at all zoom levels
  const strokeWidth = Math.min(2 / Math.sqrt(zoom), 2);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger pan
    
    if (e.button !== 0 && (e.button !== 2 && !e.shiftKey)) return;
    
    const { x, y } = screenToImageCoords(e.clientX, e.clientY);
    
    // Normalize to 0-1 range for the model
    const normalizedX = x / imageWidth;
    const normalizedY = y / imageHeight;
    
    onAddPoint(
      { x: normalizedX, y: normalizedY },
      !(e.button === 2 || e.shiftKey as boolean) // isPositive = true for left click without shift
    );
  }, [screenToImageCoords, imageWidth, imageHeight, onAddPoint]);

  return (
    <>
      {maskUrl && (
        <image
          href={maskUrl}
          width={imageWidth}
          height={imageHeight}
          style={{ mixBlendMode: 'multiply' }}
        />
      )}
      {contours.map((points, index) => {
        const simplifiedPoints = simplifyPoints(points, simplification);
        return (
          <React.Fragment key={`contour-${index}`}>
            <path
              d={generateSplinePath(simplifiedPoints)}
              fill="none"
              stroke="green"
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
            {simplifiedPoints.map((p, i) => (
              <circle
                key={`point-${index}-${i}`}
                cx={p.x}
                cy={p.y}
                r={3 / zoom}
                fill="rgba(0, 255, 0, 0.3)"
                stroke="green"
                strokeWidth={1 / zoom}
              />
            ))}
          </React.Fragment>
        );
      })}
      {positivePoints.map((p, i) => (
        <circle
          key={`pos-${i}`}
          cx={p.x * imageWidth}
          cy={p.y * imageHeight}
          r={4 / zoom}
          fill="rgba(0, 255, 0, 0.5)"
          stroke="rgb(0, 255, 0)"
          strokeWidth={1 / zoom}
        />
      ))}
      {negativePoints.map((p, i) => (
        <circle
          key={`neg-${i}`}
          cx={p.x * imageWidth}
          cy={p.y * imageHeight}
          r={4 / zoom}
          fill="rgba(255, 0, 0, 0.5)"
          stroke="rgb(255, 0, 0)"
          strokeWidth={1 / zoom}
        />
      ))}
      <rect
        x={0}
        y={0}
        width={imageWidth}
        height={imageHeight}
        fill="transparent"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          handleClick(e);
        }}
        style={{ cursor: 'crosshair' }}
      />
    </>
  );
};

interface Props {
  image: ImageInfo;
  mmPerPixel?: number;
  onConfirmOutline: (paths: Point[][], bitmap?: {
    url: string;
    width: number;
    height: number;
    position: Point;
  }) => void;
  onClose: () => void;
}

const MaskOutline: React.FC<Props> = ({ image, mmPerPixel, onConfirmOutline, onClose }) => {
  const [positivePoints, setPositivePoints] = useState<Point[]>([]);
  const [negativePoints, setNegativePoints] = useState<Point[]>([]);
  const [status, setStatus] = useState<string>('');
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [contours, setContours] = useState<Point[][]>([]);  // Changed from svgPaths
  const [simplification, setSimplification] = useState(0);
  const [lineThicknessMM, setLineThicknessMM] = useState(1.0); // Default padding in mm
  // Convert mm to pixels and double for padding since line thickness of 5mm only pads by 2.5mm
  const lineThickness = mmPerPixel ? (lineThicknessMM * 2) / mmPerPixel : 2;
  const workerRef = useRef<Worker | null>(null);

  const extractPathsFromSVG = (svgString: string): Point[][] => {
    const paths: Point[][] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const pathElements = doc.getElementsByTagName('path');
    for (let i = 0; i < pathElements.length; i++) {
      const d = pathElements[i].getAttribute('d');
      if (d) paths.push(...pathToPoints(d));
    }
    return paths;
  };

  const renderSvgToCanvas = (svgString: string, lineWidth: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Create a new canvas
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Fill the canvas with white
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Modify the SVG to add a stroke with lineWidth while keeping the black fill
      // Original SVG has: stroke="none" fill="black" fill-rule="evenodd"
      const modifiedSvg = svgString.replace(
        /(stroke=)"none"(.*?)(fill=)"black"(.*?)(fill-rule=)"evenodd"/,
        `$1"black"$2$3"black"$4$5"evenodd" stroke-width="${lineWidth}"`
      );
      
      // Create an SVG image
      const img = new Image();
      img.onload = () => {
        // Draw the modified SVG
        ctx.drawImage(img, 0, 0);
        
        // Return the canvas data URL
        resolve(canvas.toDataURL());
      };
      img.onerror = () => {
        reject(new Error('Failed to load SVG'));
      };
      
      // Create a Blob URL from the modified SVG string
      const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
      img.src = URL.createObjectURL(blob);
    });
  };

  // Store the current mask data for reuse when only lineThickness changes
  const maskDataRef = useRef<{
    mask: any;
    scores: number[];
    bestIndex: number;
    bwDataUrl: string;
    initialSvgString: string;
  } | null>(null);

  // Initialize worker and start segmentation
  useEffect(() => {
    workerRef.current = new Worker(new URL('../utils/worker.ts', import.meta.url), { type: 'module' });
    setStatus('Loading model...');
    if (!workerRef.current) return;
    workerRef.current.onmessage = async (e) => {
      if (e.data.type === 'ready') {
        console.log("Ready.")
        setStatus('Preparing image...');
        if(!workerRef.current) {
            throw new Error('Worker not initialized');
        }
      } else if (e.data.type === 'error') {
        console.error('Worker error:', e.data.error);
        setStatus(`Error: ${e.data.error}`);
        return;
      }
      
      if (e.data.type === 'ready' && workerRef.current) {
        workerRef.current.postMessage({
          type: 'segment',
          data: image.url
        });
      } else if (e.data.type === 'segment_result') {
        if (e.data.data === 'done') {
          setStatus('');
        }
      } else if (e.data.type === 'decode_result') {
        console.log(e.data.data);
        const { mask, scores } = e.data.data;
        
        // Select best mask from the three predictions
        const numMasks = scores.length;
        let bestIndex = 0;
        for (let i = 1; i < numMasks; i++) {
          if (scores[i] > scores[bestIndex]) {
            bestIndex = i;
          }
        }
        
        // Create canvas and fill with mask data
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Create ImageData from mask, handling the fact that masks are interleaved
        const imgData = ctx.createImageData(image.width, image.height);
        for (let i = 0; i < image.width * image.height; i++) {
          const maskValue = mask.data[numMasks * i + bestIndex];
          const idx = i * 4;
          imgData.data[idx] = 0;     // R
          imgData.data[idx+1] = 114;  // G
          imgData.data[idx+2] = 189;  // B
          imgData.data[idx+3] = maskValue ? 128 : 0;  // A (semi-transparent)
        }
        ctx.putImageData(imgData, 0, 0);
        
        setMaskUrl(canvas.toDataURL());
        
        // Create a black and white version for Potrace
        const bwCanvas = document.createElement('canvas');
        bwCanvas.width = image.width;
        bwCanvas.height = image.height;
        const bwCtx = bwCanvas.getContext('2d');
        if (!bwCtx) return;
        
        const bwImgData = bwCtx.createImageData(image.width, image.height);
        for (let i = 0; i < image.width * image.height; i++) {
          const maskValue = mask.data[numMasks * i + bestIndex];
          const idx = i * 4;
          // Make it black (0,0,0) where the mask is present, white (255,255,255) elsewhere
          const colorValue = maskValue ? 0 : 255;
          bwImgData.data[idx] = colorValue;     // R
          bwImgData.data[idx+1] = colorValue;   // G
          bwImgData.data[idx+2] = colorValue;   // B
          bwImgData.data[idx+3] = 255;          // A (fully opaque)
        }
        bwCtx.putImageData(bwImgData, 0, 0);
        const bwDataUrl = bwCanvas.toDataURL();
        
        // Process with the first Potrace
        setStatus('Generating initial SVG outline...');
        Potrace.loadImageFromUrl(bwDataUrl);
        Potrace.process(async function(){
          // Get the first SVG from potrace
          const initialSvgString = Potrace.getSVG(1);
          
          // Store mask data for reuse when lineThickness changes
          maskDataRef.current = {
            mask,
            scores,
            bestIndex,
            bwDataUrl,
            initialSvgString
          };
          
          try {
            setStatus('Rendering SVG to canvas with line thickness...');
            // Render the SVG to a canvas with the specified line thickness
            const canvasUrl = await renderSvgToCanvas(initialSvgString, lineThickness);
            
            // Run Potrace on the thickened SVG
            setStatus('Processing thickened SVG...');
            Potrace.loadImageFromUrl(canvasUrl);
            Potrace.process(function(){
              const finalSvgString = Potrace.getSVG(1);
              const paths = extractPathsFromSVG(finalSvgString);
              setContours(paths);
              setStatus('');
            });
          } catch (error) {
            console.error('Error in SVG processing:', error);
            setStatus('');
          }
        });
      }
    };

    return () => workerRef.current?.terminate();
  }, [image.url, image.width, image.height]);

  // Send point queries when points change
  useEffect(() => {
    // Reset the stored mask data
    maskDataRef.current = null;
    
    if (positivePoints.length === 0 && negativePoints.length === 0) {
      setMaskUrl(null);
      return;
    }

    setStatus('Generating mask...');
    const points = [
      ...positivePoints.map(p => ({ point: [p.x, p.y], label: 1 })),
      ...negativePoints.map(p => ({ point: [p.x, p.y], label: 0 }))
    ];

    workerRef.current?.postMessage({
      type: 'decode',
      data: points
    });
  }, [positivePoints, negativePoints, image.width, image.height]);

  const handleAddPoint = useCallback((point: Point, isPositive: boolean) => {
    if (isPositive) {
      setPositivePoints(prev => [...prev, point]);
    } else {
      setNegativePoints(prev => [...prev, point]);
    }
  }, []);

  const handleClear = useCallback(() => {
    setPositivePoints([]);
    setNegativePoints([]);
    setContours([]);
  }, []);

  const handleConfirm = useCallback(() => {
    if (contours.length > 0) {
      const simplifiedContours = contours.map(points => 
        simplifyPoints(points, simplification)
      );
      
      onConfirmOutline(simplifiedContours, {
        url: image.url,
        width: image.width,
        height: image.height,
        position: { x: 0, y: 0 }
      });
    }
  }, [contours, simplification, image, onConfirmOutline]);

  const handleLineThicknessChange = useCallback(async (event: Event, value: number | number[]) => {
    const thicknessMM = value as number;
    setLineThicknessMM(thicknessMM);
    
    // Convert mm to pixels and double the value for padding
    // (line thickness of 5mm only pads by 2.5mm, so we double it)
    const thickness = mmPerPixel ? (thicknessMM * 2) / mmPerPixel : thicknessMM * 2;
    
    // If we have the stored mask data, use it to avoid reprocessing the mask
    if (maskDataRef.current) {
      try {
        setStatus('Rendering SVG to canvas with new line thickness...');
        // Render the SVG to a canvas with the new line thickness
        const canvasUrl = await renderSvgToCanvas(maskDataRef.current.initialSvgString, thickness);
        
        // Run Potrace on the thickened SVG
        setStatus('Processing thickened SVG...');
        Potrace.loadImageFromUrl(canvasUrl);
        Potrace.process(function(){
          const finalSvgString = Potrace.getSVG(1);
          const paths = extractPathsFromSVG(finalSvgString);
          setContours(paths);
          setStatus('');
        });
      } catch (error) {
        console.error('Error in SVG processing:', error);
        setStatus('');
      }
    }
  }, [mmPerPixel]);

  return (
    <>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <ZoomableSvgView image={image}>
          <MaskOverlay
            maskUrl={maskUrl}
            contours={contours}
            positivePoints={positivePoints}
            negativePoints={negativePoints}
            onAddPoint={handleAddPoint}
            imageWidth={image.width}
            imageHeight={image.height}
            simplification={simplification}
          />
        </ZoomableSvgView>
        {status && (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'rgba(255,255,255,0.9)',
            p: 2,
            borderRadius: 1
          }}>
            <CircularProgress size={24} />
            <Typography>{status}</Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography sx={{ minWidth: '120px' }}>
            Padding (mm):
          </Typography>
          <Slider
            value={lineThicknessMM}
            valueLabelDisplay='auto'
            valueLabelFormat={(value) => `${value} mm`}
            onChange={handleLineThicknessChange}
            min={0.1}
            max={mmPerPixel ? 5 : 10}
            step={0.1}
            sx={{ flexGrow: 1, mx: 2 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography sx={{ minWidth: '120px' }}>
            Simplify contour:
          </Typography>
          <Slider
            value={simplification}
            valueLabelDisplay='auto'
            onChange={(_, value) => setSimplification(value as number)}
            min={0}
            max={100}
            step={1}
            sx={{ flexGrow: 1, mx: 2 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={handleClear}>Clear Points</Button>
          <Button 
            variant="contained" 
            onClick={handleConfirm}
            disabled={contours.length === 0}
          >
            Confirm outline
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Box>
      </Box>
    </>
  );
};

export default MaskOutline;