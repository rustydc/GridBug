import React, { useState } from 'react';
import { Box, Fab, Slider, Stack, Tooltip, Typography } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useStore } from '../../store';
import ThreeContext from './ThreeContext';
import ReplicadMesh from './ReplicadMesh';
import { useGenerateModel, useStepExport } from '../../workers/replicad/replicadQueries';

interface ReplicadViewerProps {
  width: number;
  height: number;
  active: boolean;
}

const ReplicadViewer: React.FC<ReplicadViewerProps> = ({ width, height, active }) => {
  const outlines = useStore(state => state.outlines);
  
  // Calculate default bin height based on max depth + wall width + base thickness
  const calculateDefaultBinHeight = (outlines: Array<{ depth?: number }>) => {
    const BASE_HEIGHT = 4.75;
    const BOTTOM_THICKNESS = 1; // Wall thickness/width
    const UNIT_SIZE = 7; // Round up to nearest multiple of 7mm
    // Find maximum depth among all outlines
    const maxDepth = outlines.length > 0
      ? Math.max(...outlines.map(o => o.depth || 20))
      : 20;
    
    // Calculate default bin height (max depth + wall width + base), rounded up to nearest unit
    const calculatedHeight = maxDepth + BOTTOM_THICKNESS + BASE_HEIGHT;
    return Math.ceil(calculatedHeight / UNIT_SIZE) * UNIT_SIZE;
  };
  
  // Calculate default height (will be used for initial value and when outlines change)
  const defaultHeight = React.useMemo(() => calculateDefaultBinHeight(outlines), [outlines]);
  
  // Keep track of whether the user has manually adjusted the height
  const [userAdjustedHeight, setUserAdjustedHeight] = useState(false);
  
  // Bin height state (initialize with default)
  const [binHeight, setBinHeight] = useState<number>(defaultHeight);
  const [tempBinHeight, setTempBinHeight] = useState<number>(defaultHeight);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isExportingStep, setIsExportingStep] = useState(false);

  // Use TanStack Query with proper caching
  const { 
    data: meshData, 
    isLoading: isModelGenerating,
    error: modelError,
    isFetching: isModelFetching,
  } = useGenerateModel(outlines, binHeight, 4.75, active && !isDragging);
  
  // Use the query for STEP export, but only enable it when needed
  const {
    isLoading: isStepLoading,
    error: stepError,
    refetch: refetchStep
  } = useStepExport(outlines, binHeight, 4.75, isExportingStep);

  // Log errors
  if (modelError) {
    console.error('Error generating 3D model:', modelError);
  }
  
  if (stepError) {
    console.error('Error generating STEP file:', stepError);
  }

  // Handle STEP file export via the query
  const handleExportSTEP = async () => {
    setIsExportingStep(true);
    try {
      const result = await refetchStep();
      if (result.data) {
        downloadFile(result.data, 'gridbug-bin.step');
      }
    } catch (error) {
      console.error('Error exporting STEP:', error);
    } finally {
      setIsExportingStep(false);
    }
  };
  
  // Helper function to download files
  const downloadFile = (content: string | ArrayBuffer | Blob, filename: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Update bin height when outlines change or default height changes
  React.useEffect(() => {
    // Only update automatically if user hasn't manually adjusted the height
    if (!userAdjustedHeight && !isDragging) {
      setBinHeight(defaultHeight);
      setTempBinHeight(defaultHeight);
    }
  }, [defaultHeight, userAdjustedHeight, isDragging]);
  
  // Calculate the viewing area height
  const viewHeight = height - 60; // Leave minimal room for the slider
  const isLoading = isModelGenerating || isModelFetching;
  
  // Handler for when slider dragging starts
  const handleSliderDragStart = () => {
    setIsDragging(true);
  };
  
  // Handler for when slider dragging stops - update the actual bin height value
  const handleSliderDragStop = () => {
    setIsDragging(false);
    setBinHeight(tempBinHeight);
    // Mark that the user has manually adjusted the height
    setUserAdjustedHeight(true);
  };
  
  // Update temp bin height while dragging
  const handleSliderChange = (_: Event, value: number | number[]) => {
    setTempBinHeight(value as number);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box 
        sx={{ 
          width: width, 
          height: viewHeight,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#f9f9f9',
        }}
      >
        {/* Three.js Canvas managed by react-three-fiber */}
        <ThreeContext 
          width={width} 
          height={viewHeight}
        >
          {meshData && <ReplicadMesh faces={meshData.faces} edges={meshData.edges} />}
        </ThreeContext>
        
        {/* Loading indicator */}
        {isLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              zIndex: 10,
            }}
          >
            <Typography variant="h6">
              Loading 3D model...
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Controls and settings */}
      <Stack spacing={0} sx={{ mt: 0.5, py: 0.5, px: 2, border: '1px solid #eee', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ minWidth: '120px' }}>
            Bin Height (mm)
            {userAdjustedHeight && (
              <Tooltip title="Reset to default height based on max depth">
                <Typography 
                  variant="caption" 
                  component="span" 
                  sx={{ 
                    ml: 1, 
                    cursor: 'pointer', 
                    color: 'primary.main',
                    textDecoration: 'underline'
                  }}
                  onClick={() => {
                    setBinHeight(defaultHeight);
                    setTempBinHeight(defaultHeight);
                    setUserAdjustedHeight(false);
                  }}
                >
                  (reset)
                </Typography>
              </Tooltip>
            )}
          </Typography>
          <Slider
            value={isDragging ? tempBinHeight : binHeight}
            onChange={handleSliderChange}
            onMouseDown={handleSliderDragStart}
            onMouseUp={handleSliderDragStop}
            onTouchStart={handleSliderDragStart}
            onTouchEnd={handleSliderDragStop}
            min={5}
            max={100}
            step={1}
            valueLabelDisplay="auto"
            color="primary"
            sx={{ flex: 1, my: 0 }}
          />
        </Box>
      </Stack>
      
      {/* Export STEP FAB */}
      <Box sx={{ 
        position: 'fixed', 
        bottom: 16, 
        right: 16, 
        zIndex: 1000 
      }}>
        <Tooltip title="Export 3D Model (STEP)">
          <Fab
            color="primary"
            aria-label="export-step"
            onClick={handleExportSTEP}
            disabled={isLoading || isStepLoading}
          >
            <FileDownloadIcon />
          </Fab>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default ReplicadViewer;