/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectData } from '../types';
import { setOC } from 'replicad';
import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
// Import the WASM file directly
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { catmullToBezier } from '../utils/spline';
import { calculateMinimalGridArea } from '../utils/grid';

// Initialization flag to ensure we only run setup once
let isReplicadInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize replicad with OpenCascade
 */
export const initializeReplicad = async (): Promise<void> => {
  if (isReplicadInitialized) return;
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = new Promise<void>((resolve, reject) => {
    // Initialize OpenCascade.js with the WASM file
    // Use any to work around TypeScript limitations
    console.log('Loading OpenCascade with WASM URL:', opencascadeWasm);
    
    (opencascade as any)({
      locateFile: () => opencascadeWasm,
    })
      .then((OC: any) => {
        // Inject OpenCascade instance into replicad
        setOC(OC);
        
        isReplicadInitialized = true;
        console.log('Replicad initialized successfully with OpenCascade');
        resolve();
      })
      .catch((error: unknown) => {
        console.error('Failed to initialize replicad with OpenCascade:', error);
        initializationPromise = null;
        reject(error);
      });
  });
  
  return initializationPromise;
};

/**
 * Converts 2D SVG outline shapes to 3D models using replicad
 */
export const convertShapesToModel = async (
  outlines: ObjectData[],
  totalHeight: number,
  wallThickness: number,
  baseHeight: number = 4.75 // Default base height is 4.75mm
) => {
  // Make sure replicad is initialized first
  await initializeReplicad();
  
  // Log outlines for debugging - only do this once
  console.log('Creating model from outlines:', outlines.length);
  
  // Calculate the minimal grid area to get the base rectangle size
  const { min, max } = calculateMinimalGridArea(outlines);
  console.log('Grid area:', { min, max });
  
  // Create rounded rectangle base at the center of the grid
  const width = max.x - min.x;
  const height = max.y - min.y;
  
  // Constants for the bin
  const BIN_CORNER_RADIUS = 7.5; // Base corner radius in mm
  const wallHeight = totalHeight - baseHeight; // Calculate the wall height
  
  // Draw the standard 41.5mm base with 7.5mm corner radius
  const baseRect = replicad.drawRoundedRectangle(max.x - min.x, max.y - min.y, BIN_CORNER_RADIUS);
  
  // Now process each outline as a cutout for the walls
  let wallsShape = baseRect; // The wall shape that will get cutouts
  
  for (const obj of outlines) {
    let cutoutShape;
    
    if (obj.type === 'roundedRect') {
      // Create a rounded rectangle at the correct position
      // Need to adjust position relative to the grid min
      // NOTE: We negate the X coordinate to correct the left/right flipping in 3D view
      const rectX = -1 * (obj.position.x - min.x - width/2);
      const rectY = obj.position.y - min.y - height/2;
      
      cutoutShape = replicad.drawRoundedRectangle(
        obj.width, 
        obj.height,
        obj.radius
      ).translate(rectX, rectY);
    } 
    else if (obj.type === 'spline') {
      // Create a proper spline path using bezier curves
      const splinePoints = obj.points;
      
      // Adjust position relative to the grid min
      // NOTE: We negate the X coordinate to correct the left/right flipping in 3D view
      const splineX = -1 * (obj.position.x - min.x - width/2);
      const splineY = obj.position.y - min.y - height/2;
            
      // Create a closed loop by creating an array of:
      // [last point, all points, first point, second point]
      const allPoints = [
        splinePoints[splinePoints.length - 1],
        ...splinePoints,
        splinePoints[0],
        splinePoints[1]
      ];
      
      // Start with the first point - mirror the X coordinate
      const startPoint = splinePoints[0];
      
      // Create a sketch starting with the first point (with mirrored X)
      let sketcher = replicad.draw([-startPoint.x, startPoint.y]);
      
      // Add cubic bezier curves for each segment
      for (let i = 1; i < allPoints.length - 2; i++) {
        const p0 = allPoints[i - 1];
        const p1 = allPoints[i];
        const p2 = allPoints[i + 1];
        const p3 = allPoints[i + 2];
        
        // Get control points for this segment using the same function as in the UI
        const [cp1, cp2] = catmullToBezier(p0, p1, p2, p3);
        
        // Add cubic bezier curve to the sketch - mirror the X coordinates
        // Format: cubicBezierCurveTo(end, startControlPoint, endControlPoint)
        sketcher = sketcher.cubicBezierCurveTo(
          [-p2.x, p2.y],        // end point with mirrored X
          [-cp1.x, cp1.y],      // first control point with mirrored X
          [-cp2.x, cp2.y]       // second control point with mirrored X
        );
      }
      
      // Close the shape
      const sketch = sketcher.close();
      
      // Translate the sketch to the correct position
      cutoutShape = sketch.translate(splineX, splineY);
    }
    
    if (!cutoutShape) {
      throw new Error('Cutout shape is undefined');
    }

    wallsShape = wallsShape.cut(cutoutShape);
  }
  
  // Create base
  console.log('Creating base shape...');
  let finalModel; 
  
  // Create the base 
  const baseSketch = baseRect.sketchOnPlane();
  const baseModel = baseSketch.extrude(baseHeight) as replicad.Solid;
  console.log(`Created base with height ${baseHeight}mm`);
  
  // Create walls (with cutouts if any)
  console.log('Creating wall shape with cutouts...');
  let wallsModel;
  
  const wallsSketch = wallsShape.sketchOnPlane();
  // Position walls on top of the base
  wallsModel = wallsSketch.extrude(wallHeight).translate(0, 0, baseHeight) as replicad.Solid;
  console.log(`Created walls with height ${wallHeight}mm`);
  
  // Combine the base and walls into a single model
  finalModel = baseModel.fuse(wallsModel);
  console.log('Successfully created final 3D model by combining base and walls');

  return finalModel;
};