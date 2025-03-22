import React, { useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Fab, Button, Modal } from '@mui/material';
import CropSquareRoundedIcon from '@mui/icons-material/CropSquareRounded';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ImageIcon from '@mui/icons-material/Image';
import MainCanvas from './components/MainCanvas';
import ImageOutliner from './components/ImageOutliner';
import { useStore } from './store';
import { Point, ImageInfo } from './types';
import { parseSVGPath } from './utils/svgParser';
import { generateSVG } from './utils/svgExport';

const App: React.FC = () => {
  const { addOutline, deleteOutline, outlines, centerView } = useStore();
  const { undo, redo } = useStore.temporal.getState();
  const [imageData, setImageData] = React.useState<ImageInfo | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(text, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');
    
    if (svgElement) {
      svgElement.querySelectorAll('path').forEach(path => {
        const pathData = path.getAttribute('d');
        if (pathData) {
          const points = parseSVGPath(pathData, svgElement);
          if (points.length > 0) {
            addOutline([points]); // Wrap points in array for MultiContour
          }
        }
      });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageData({
        url,
        width: img.width,
        height: img.height
      });
    };
    img.src = url;
  };

  const handleImageOutlineComplete = (
    paths: Point[][], 
    bitmap?: {
      url: string;
      width: number;
      height: number;
      position: Point;
    }
  ) => {
    for (const path of paths) {
      addOutline([path], bitmap);
    }
    setImageData(null);
  };

  const handleAddShape = () => {
    // Create a default square - now wrapped in array for multi-contour support
    addOutline([[
      { x: -21, y: -21 },
      { x: 21, y: -21 },
      { x: 21, y: 21 },
      { x: -21, y: 21 }
    ]]);
  };

  const handleDownload = () => {
    const svgContent = generateSVG(outlines);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gridbug-export.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = outlines.find(o => o.selected);
        if (selected) {
          deleteOutline(selected.id);
        }
      } else if (e.key === 'c' && e.ctrlKey) {
        centerView();
      } else if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [outlines, undo, redo, deleteOutline, centerView]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">GridBug</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <MainCanvas />
      </Box>
      <Box sx={{ 
        position: 'fixed', 
        bottom: 16, 
        right: 16, 
        display: 'flex', 
        gap: 2,
        zIndex: 1000 
      }}>
        <Fab 
          color="primary" 
          aria-label="add" 
          onClick={handleAddShape}
        >
          <CropSquareRoundedIcon />
        </Fab>
        <Fab 
          color="primary" 
          aria-label="upload" 
        >
          <input
            type="file"
            accept=".svg"
            multiple
            style={{ display: 'none' }}
            id="svg-upload"
            onChange={handleFileUpload}
          />
          <label htmlFor="svg-upload">
            <FileUploadIcon />
          </label>
        </Fab>
        <Fab 
          color="primary" 
          aria-label="download"
          onClick={handleDownload}
        >
          <FileDownloadIcon />
        </Fab>
        <Fab 
          color="primary" 
          aria-label="upload-image"
        >
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            id="image-upload"
            onChange={handleImageUpload}
          />
          <label htmlFor="image-upload">
            <ImageIcon />
          </label>
        </Fab>
      </Box>

      <Modal
        open={imageData !== null}
        onClose={() => setImageData(null)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ 
          width: '90vw', 
          height: '90vh', 
          bgcolor: 'background.paper',
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          {imageData && (
            <ImageOutliner
              image={imageData}
              onClose={() => setImageData(null)}
              onConfirmOutline={handleImageOutlineComplete}
            />
          )}
        </Box>
      </Modal>
    </Box>
  );
};

export default App;