/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Box, Button, Slider, Stack, Typography } from '@mui/material';
import { useStore } from '../store';
import { convertShapesToModel } from '../utils/replicadUtils';
import ThreeContext from './ThreeContext';
import ReplicadMesh from './ReplicadMesh';

interface ReplicadViewerProps {
  width: number;
  height: number;
}

const ReplicadViewer: React.FC<ReplicadViewerProps> = ({ width, height }) => {
  const outlines = useStore(state => state.outlines);
  console.log('ReplicadViewer received outlines:', outlines?.length || 0);
  
  const [binHeight, setBinHeight] = useState<number>(20);
  const [wallThickness, setWallThickness] = useState<number>(1.2);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [model, setModel] = useState<any>(null);
  const [meshData, setMeshData] = useState<{ faces: any; edges: any } | null>(null);

  // Generate 3D model and mesh when outlines or dimensions change
  useEffect(() => {
    const generateModel = async () => {
      setIsLoading(true);
      
      try {
        // Convert outlines to 3D model
        const newModel = await convertShapesToModel(outlines, binHeight, wallThickness);
        setModel(newModel);
        
        console.log('Model created, checking for mesh methods:', {
          hasMesh: typeof newModel.mesh === 'function',
          hasMeshEdges: typeof newModel.meshEdges === 'function'
        });
        
        // Generate mesh data for 3D rendering
        if (typeof newModel.mesh === 'function' && typeof newModel.meshEdges === 'function') {
          const faces = newModel.mesh({ tolerance: 0.05, angularTolerance: 30 });
          // Remove the keepMesh property as it's not in the type definition
          const edges = newModel.meshEdges();
          
          console.log('Generated mesh data:', { 
            hasFaces: !!faces, 
            hasEdges: !!edges 
          });
          
          setMeshData({ faces, edges });
        } else {
          console.warn('Model does not have mesh methods');
          setMeshData(null);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error generating 3D model:', error);
        setIsLoading(false);
        setMeshData(null);
      }
    };
    
    generateModel();
  }, [outlines, binHeight, wallThickness]);

  // Export STEP file
  const exportSTEP = async () => {
    try {
      if (!model) {
        // Generate a model if it doesn't exist
        const newModel = await convertShapesToModel(outlines, binHeight, wallThickness);
        setModel(newModel);
        
        if (typeof newModel.blobSTEP === 'function') {
          const step = await newModel.blobSTEP();
          downloadFile(step, 'gridbug-bin.step');
        } else {
          console.error('Model does not have blobSTEP method');
        }
      } else if (typeof model.blobSTEP === 'function') {
        // Use blobSTEP to get a blob directly for download
        const step = await model.blobSTEP();
        downloadFile(step, 'gridbug-bin.step');
      } else {
        console.error('Model does not have blobSTEP method');
      }
    } catch (error) {
      console.error('Error exporting STEP:', error);
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
            onClick={exportSTEP}
            disabled={isLoading}
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