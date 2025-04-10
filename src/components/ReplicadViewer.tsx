import React, { useState } from 'react';
import { Box, Button, Slider, Stack, Typography } from '@mui/material';
import { useStore } from '../store';
import ThreeContext from './ThreeContext';
import ReplicadMesh from './ReplicadMesh';
import { useGenerateModel, useStepExport, ReplicadFaces, ReplicadEdges } from '../workers/replicad/replicadQueries';

interface ReplicadViewerProps {
  width: number;
  height: number;
}

const ReplicadViewer: React.FC<ReplicadViewerProps> = ({ width, height }) => {
  const outlines = useStore(state => state.outlines);
  console.log('ReplicadViewer received outlines:', outlines?.length || 0);
  
  const [binHeight, setBinHeight] = useState<number>(20);
  const [wallThickness, setWallThickness] = useState<number>(1.2);
  const [isExportingStep, setIsExportingStep] = useState(false);

  // Use TanStack Query with proper caching
  const { 
    data: meshData, 
    isLoading: isModelGenerating,
    error: modelError
  } = useGenerateModel(outlines, binHeight, wallThickness);
  
  // Use the query for STEP export, but only enable it when needed
  const {
    data: stepBlob,
    isLoading: isStepLoading,
    error: stepError,
    refetch: refetchStep
  } = useStepExport(outlines, binHeight, wallThickness, 4.75, isExportingStep);

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

  // Calculate the viewing area height
  const viewHeight = height - 200; // Leave room for controls
  const isLoading = isModelGenerating;

  return (
    <Box sx={{ width: '100%' }}>
      <Box 
        sx={{ 
          width: width, 
          height: viewHeight,
          border: '1px solid #ccc',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#f7f7f7',
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
      <Stack spacing={2} sx={{ mt: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>3D Model Settings</Typography>
        
        <Box>
          <Typography gutterBottom>Bin Height (mm)</Typography>
          <Slider
            value={binHeight}
            onChange={(_, value) => setBinHeight(value as number)}
            min={5}
            max={100}
            step={1}
            valueLabelDisplay="auto"
            color="primary"
            sx={{ mb: 1 }}
          />
        </Box>
        
        <Box>
          <Typography gutterBottom>Wall Thickness (mm)</Typography>
          <Slider
            value={wallThickness}
            onChange={(_, value) => setWallThickness(value as number)}
            min={0.8}
            max={3}
            step={0.1}
            valueLabelDisplay="auto"
            color="primary"
            sx={{ mb: 1 }}
          />
        </Box>
        
        <Typography variant="subtitle1" gutterBottom sx={{ mt: 1 }}>
          Export Options
        </Typography>
        
        <Stack direction="row" spacing={2}>
          <Button 
            variant="contained" 
            onClick={handleExportSTEP}
            disabled={isLoading || isStepLoading}
            startIcon={<Box component="span" sx={{ fontWeight: 'bold' }}>STEP</Box>}
            color="primary"
          >
            Export 3D Model (STEP)
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default ReplicadViewer;