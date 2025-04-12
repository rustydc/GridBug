import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Box, Fab, Modal, Tooltip, Link, Tab, Tabs } from '@mui/material';
import CropSquareRoundedIcon from '@mui/icons-material/CropSquareRounded';
import GestureIcon from '@mui/icons-material/Gesture';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ImageIcon from '@mui/icons-material/Image';
import GitHubIcon from '@mui/icons-material/GitHub';
import MainCanvas from './components/2d/MainCanvas';
import ImageOutliner from './components/tracer/ImageOutliner';
import ReplicadViewer from './components/3d/ReplicadViewer';
import { useStore } from './store';
import { Point, ImageInfo } from './types';
import { parseSVGPath } from './utils/svgParser';
import { generateSVG } from './utils/svgExport';
import { getNextColor } from './utils/color';
import { useInitializeSam } from './workers/sam/samQueries';
import { useInitializeReplicad } from './workers/replicad/replicadQueries';

const App: React.FC = () => {
  const { 
    addOutline, 
    addRoundedRect,
    deleteOutline, 
    outlines, 
    centerView
  } = useStore();
  const { undo, redo } = useStore.temporal.getState();
  const [imageData, setImageData] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

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

    // Reset file input value so the same file can be selected again
    event.target.value = '';
    
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
  
  const handleAddRoundedRect = () => {
    // Create a default rounded rectangle
    addRoundedRect(80, 60, 15);
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

  // Initialize workers when the app loads
  useInitializeSam();
  useInitializeReplicad();

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
      } else if (e.key === 'd' && e.ctrlKey) {
        // Duplicate the selected outline with a new color
        const selected = outlines.find(o => o.selected);
        if (selected) {
          if (selected.type === 'spline') {
            // Create a new outline with the same points but slightly offset position
            const newOutline = {
              ...selected,
              id: Math.random().toString(36).substring(2, 11),
              position: { 
                x: selected.position.x + 10, 
                y: selected.position.y + 10 
              },
              selected: false,
              color: getNextColor(outlines.length) // Generate a new color
            };
            
            addOutline(
              [[...newOutline.points]], // Wrap points in array for multi-contour format
              newOutline.bitmap,
              newOutline.position
            );
          } else if (selected.type === 'roundedRect') {
            // For rounded rectangles, create a new one with the same properties
            const rectOutline = selected;
            addRoundedRect(
              rectOutline.width,
              rectOutline.height,
              rectOutline.radius,
              { 
                x: rectOutline.position.x + 10, 
                y: rectOutline.position.y + 10 
              }
            );
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [outlines, undo, redo, deleteOutline, centerView, addOutline, addRoundedRect]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static">
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ mr: 3 }}>GridBug</Typography>
            <Tabs 
              value={viewMode} 
              onChange={(_, newValue) => setViewMode(newValue)}
              textColor="inherit"
            >
              <Tab value="2d" label="2D Editor" />
              <Tab value="3d" label="3D Preview" />
            </Tabs>
          </Box>
          <Link 
            href="https://github.com/rustydc/GridBug" 
            target="_blank"
            color="inherit"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <GitHubIcon />
          </Link>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, position: 'relative' }}>
        {viewMode === '2d' ? (
          <MainCanvas />
        ) : (
          <ReplicadViewer width={window.innerWidth} height={window.innerHeight - 64} />
        )}
      </Box>
      <Box sx={{ 
        position: 'fixed', 
        bottom: 16, 
        right: 16, 
        display: 'flex', 
        gap: 2,
        zIndex: 1000 
      }}>
        {viewMode === '2d' && (
          <>
            <Tooltip title="Insert spline">
              <Fab 
                color="primary" 
                aria-label="add" 
                onClick={handleAddShape}
              >
                <GestureIcon />
              </Fab>
            </Tooltip>
            <Tooltip title="Insert rounded rectangle">
              <Fab 
                color="primary" 
                aria-label="add-rounded" 
                onClick={handleAddRoundedRect}
              >
                <CropSquareRoundedIcon />
              </Fab>
            </Tooltip>
            <Tooltip title="Import SVG">
              <Fab 
                color="primary" 
                aria-label="upload" 
                component="label"
                htmlFor="svg-upload"
              >
                <input
                  type="file"
                  accept=".svg"
                  multiple
                  style={{ display: 'none' }}
                  id="svg-upload"
                  onChange={handleFileUpload}
                />
                <FileUploadIcon />
              </Fab>
            </Tooltip>
            <Tooltip title="Export SVG">
              <Fab 
                color="primary" 
                aria-label="download"
                onClick={handleDownload}
              >
                <FileDownloadIcon />
              </Fab>
            </Tooltip>
            <Tooltip title="Trace image">
              <Fab 
                color="primary" 
                aria-label="upload-image"
                component="label"
                htmlFor="image-upload"
              >
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="image-upload"
                  onChange={handleImageUpload}
                />
                <ImageIcon />
              </Fab>
            </Tooltip>
          </>
        )}
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