/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectData } from '../types';
import { setOC } from 'replicad';
import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
// Import the WASM file directly
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { catmullToBezier } from '../utils/spline';
import { calculateMinimalGridArea, GRID_SIZE } from '../utils/grid';

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
  binHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _wallThickness: number // Prefixed with _ to indicate it's not used yet
) => {
  // Make sure replicad is initialized first
  await initializeReplicad();
  
  // Log outlines for debugging - only do this once
  console.log(`Converting ${outlines.length} outlines to 3D model with height ${binHeight}mm`);
  
  // Always attempt to use outlines whether they're empty or not,
  // as we want to convert the actual shapes when possible
  try {
    // This is a simplified implementation - will need to be expanded
    // to handle all the different shape types in your application
    
    // For demonstration, we'll create a simple sketch from the first object
    // In a real implementation, you would need to:
    // 1. Extract paths from your objects
    // 2. Convert them to replicad sketch paths
    // 3. Combine them appropriately
    // 4. Extrude and perform boolean operations

    console.log('Creating model from outlines:', outlines.length);
    
    try {
      // Calculate the minimal grid area to get the base rectangle size
      const { min, max } = calculateMinimalGridArea(outlines);
      console.log('Grid area:', { min, max });
      
      // Calculate width and height in grid units
      const gridWidth = Math.max(1, (max.x - min.x) / GRID_SIZE);
      const gridHeight = Math.max(1, (max.y - min.y) / GRID_SIZE);
      console.log(`Grid size: ${gridWidth}x${gridHeight} units (${gridWidth * GRID_SIZE}x${gridHeight * GRID_SIZE}mm)`);
      
      // Create rounded rectangle base at the center of the grid
      const width = gridWidth * GRID_SIZE;
      const height = gridHeight * GRID_SIZE;
      const cornerRadius = 10; // Fixed corner radius
      
      // Draw the base rectangle
      const baseRect = replicad.drawRoundedRectangle(width, height, cornerRadius);
      console.log('Created base rectangle:', baseRect);
      
      // Now process each outline as a cutout
      let currentShape = baseRect;
      
      for (const obj of outlines) {
        try {
          let cutoutShape;
          
          if (obj.type === 'roundedRect') {
            // Create a rounded rectangle at the correct position
            // Need to adjust position relative to the grid min
            // NOTE: We negate the X coordinate to correct the left/right flipping in 3D view
            const rectObj = obj as any;
            const rectX = -1 * (rectObj.position.x - min.x - width/2);
            const rectY = rectObj.position.y - min.y - height/2;
            
            cutoutShape = replicad.drawRoundedRectangle(
              rectObj.width, 
              rectObj.height,
              rectObj.radius
            ).translate(rectX, rectY);
            
            console.log(`Created rounded rect cutout at (${rectX}, ${rectY})`);
          } 
          else if (obj.type === 'spline') {
            // Create a proper spline path using bezier curves
            const splineObj = obj as any;
            const splinePoints = splineObj.points;
            
            // Adjust position relative to the grid min
            // NOTE: We negate the X coordinate to correct the left/right flipping in 3D view
            const splineX = -1 * (splineObj.position.x - min.x - width/2);
            const splineY = splineObj.position.y - min.y - height/2;
            
            console.log(`Creating spline with ${splinePoints.length} points at (${splineX}, ${splineY})`);
            
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
            
            console.log(`Created spline cutout at (${splineX}, ${splineY})`);
          }
          
          // Cut the shape from the base if we created one
          if (cutoutShape && typeof currentShape.cut === 'function') {
            currentShape = currentShape.cut(cutoutShape);
            console.log('Cut shape from base rectangle');
          }
        } catch (shapeError) {
          console.error('Error processing a shape cutout:', shapeError);
          // Continue with the next shape
        }
      }
      
      // Convert to 3D by first creating a sketch on a plane
      const sketch = currentShape.sketchOnPlane();
      console.log('Created sketch on plane from final shape');
      
      // Extrude the sketch to create a 3D model
      const extruded = sketch.extrude(binHeight);
      console.log('Successfully extruded to 3D:', extruded);
      
      return extruded;
    } catch (error) {
      console.error('Error creating model with cutouts:', error);
      
      // Fallback to simple rounded rectangle without cutout
      const rect = replicad.drawRoundedRectangle(100, 100, 10);
      const sketch = rect.sketchOnPlane();
      const extruded = sketch.extrude(binHeight);
      console.log('Created fallback 3D model (simple box)');
      
      return extruded;
    }
  } catch (error) {
    console.error('Error converting shapes to 3D model:', error);
    // Return fallback model with the simplest possible approach
    console.error('Trying absolute fallback model...');
    try {
      // Last ditch effort - try simplified approach
      const rect = replicad.drawRectangle(100, 100);
      
      if (rect && typeof rect.sketchOnPlane === 'function') {
        const sketch = rect.sketchOnPlane();
        const extruded = sketch.extrude(binHeight);
        console.log('Created fallback 3D model:', extruded);
        return extruded;
      }
      
      // If that fails too, throw the original error
      console.error('All fallback approaches failed');
      throw error;
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw error; // Re-throw the original error
    }
  }
};

/**
 * In a real implementation, this function would:
 * 1. Parse SVG paths from your objects
 * 2. Convert them to replicad sketches
 * 3. Apply appropriate transformations
 */
export const svgPathToReplicadSketch = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _svgPath: string
) => {
  // Import replicad dynamically to avoid TypeScript errors with its types
  const replicad = await import('replicad');
  
  // This is a placeholder - real implementation would parse SVG path
  // and convert to replicad operations
  
  // For now, return a simple rectangle
  return replicad.drawRectangle(100, 100);
};