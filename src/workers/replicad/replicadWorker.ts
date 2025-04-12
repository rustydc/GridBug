/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Comlink from 'comlink';
import { ReplicadWorkerAPI, ReplicadFaces, ReplicadEdges } from './replicadWorkerApi';
import { ObjectData } from '../../types';
import { catmullToBezier } from '../../utils/spline';
import { calculateMinimalGridArea, GRID_SIZE, TOLERANCE } from '../../utils/grid';

// We'll use dynamic imports to load the modules
let replicad: any;
let opencascadeWasm: any;
let opencascade: any;

// Initialization flag
let isReplicadInitialized = false;

// Singleton class for managing replicad and OpenCascade
class ReplicadSingleton {
  static async loadModules() {
    if (!replicad) {
      console.log('Loading replicad module');
      replicad = await import('replicad');
    }
    
    if (!opencascade) {
      console.log('Loading opencascade module');
      opencascade = await import('replicad-opencascadejs/src/replicad_single.js');
      opencascadeWasm = await import('replicad-opencascadejs/src/replicad_single.wasm?url');
    }
    
    return { replicad, opencascade, opencascadeWasm };
  }
  
  static async initialize() {
    if (isReplicadInitialized) return;
    
    try {
      // Load the modules
      const { replicad, opencascade, opencascadeWasm } = await this.loadModules();
      
      console.log('Loading OpenCascade with WASM URL:', opencascadeWasm.default);
      
      // Initialize OpenCascade.js with the WASM file
      const OC = await opencascade.default({
        locateFile: () => opencascadeWasm.default,
      });
      
      // Inject OpenCascade instance into replicad
      replicad.setOC(OC);
      
      isReplicadInitialized = true;
      console.log('Replicad initialized successfully with OpenCascade');
    } catch (error) {
      console.error('Failed to initialize replicad with OpenCascade:', error);
      throw error;
    }
  }
}

class ReplicadWorkerImpl implements ReplicadWorkerAPI {
  async initialize(): Promise<void> {
    try {
      await ReplicadSingleton.initialize();
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw new Error('Failed to initialize replicad: ' + String(error));
    }
  }

  async isReady(): Promise<boolean> {
    return isReplicadInitialized;
  }

  /**
   * Helper method to create a 3D model
   */
  private async createModel(
    outlines: ObjectData[],
    totalHeight: number,
    wallThickness: number,
    baseHeight: number = 4.75
  ): Promise<any> {
    // Make sure replicad is initialized
    if (!isReplicadInitialized) {
      await this.initialize();
    }

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
        
        // First create the basic shape
        let rectShape = replicad.drawRoundedRectangle(
          obj.width, 
          obj.height,
          obj.radius
        );
        
        rectShape = rectShape.rotate(-obj.rotation, [0, 0]);
        cutoutShape = rectShape.translate(rectX, rectY);
      } else if (obj.type === 'spline') {
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
        let sketch = sketcher.close();
        
        sketch = sketch.rotate(-obj.rotation, [0, 0]);
        cutoutShape = sketch.translate(splineX, splineY);
      }
      
      if (!cutoutShape) {
        throw new Error('Cutout shape is undefined');
      }

      wallsShape = wallsShape.cut(cutoutShape);
    }

    // Create a grid of individual base units
    console.log('Creating grid of base units...');
    let finalModel;
    
    // Top size - use GRID_SIZE - TOLERANCE for the outer dimension
    const outerDim = GRID_SIZE - TOLERANCE; // 41.5mm
    const middleDim = outerDim - 2.15; // 39.35mm - after 45-degree slope
    const bottomDim = middleDim - 0.8; // 38.55mm - after second 45-degree slope
    
    // Calculate how many grid cells fit in the total area
    const numUnitsX = Math.round(width / GRID_SIZE);
    const numUnitsY = Math.round(height / GRID_SIZE);
    
    console.log(`Creating grid of ${numUnitsX}x${numUnitsY} units`);
    
    // Create a single base unit with beveled profile
    // Create profiles for lofting
    // Top profile at full size
    const topProfile = replicad.drawRoundedRectangle(outerDim, outerDim, BIN_CORNER_RADIUS);
    const middleProfile = topProfile.offset(-2.15/2);
    const bottomProfile = middleProfile.offset(-0.8/2);
    
    // Heights for the profiles
    const topHeight = baseHeight; // Top of the base
    const middleHeight = topHeight - 2.15; // After first 45-degree slope
    const flatHeight = middleHeight - 1.8; // After vertical section
    const bottomHeight = 0; // Bottom of the base
    
    // Create sketches at different heights using the proper replicad API
    // Using the Drawing objects directly for sketch placement
    const topSketch = topProfile.sketchOnPlane("XY", topHeight) as any;
    const middleSketch = middleProfile.sketchOnPlane("XY", middleHeight) as any;
    const flatSketch = middleProfile.sketchOnPlane("XY", flatHeight) as any;
    const bottomSketch = bottomProfile.sketchOnPlane("XY", bottomHeight) as any;
    
    // Create the base unit by lofting through the profiles
    const baseUnit = topSketch.loftWith([middleSketch, flatSketch, bottomSketch], {ruled: true}) as any;
        
    // Create a 1mm thick bottom for the bin
    console.log('Creating bin bottom...');
    const bottomThickness = 1.0; // 1mm thick bottom
    
    // Create the bottom as a simple extrusion of the base rectangle
    const binBottomSketch = baseRect.sketchOnPlane("XY", baseHeight);
    const bottomModel = binBottomSketch.extrude(bottomThickness) as any;
    console.log(`Created ${bottomThickness}mm thick bin bottom`);
    
    // Clone and position units to create the complete base
    let baseModel: any = bottomModel;

  
    // Calculate the starting position (centered grid)
    const startX = -width/2 + (outerDim)/2;
    const startY = -height/2 + (outerDim)/2;
    
    for (let y = 0; y < numUnitsY; y++) {
      for (let x = 0; x < numUnitsX; x++) {
        // Calculate position for this unit
        const posX = startX + x * GRID_SIZE;
        const posY = startY + y * GRID_SIZE;
        
        // Clone and position the base unit
        const unitClone = baseUnit.clone().translate(posX, posY, 0);
        
        // Add to the combined model with commonFace optimization
        baseModel = baseModel.fuse(unitClone, { optimisation: "commonFace" });
      }
    }
    
    if (!baseModel) {
      throw new Error('Failed to create base model grid');
    }
    
    console.log(`Created grid of ${numUnitsX}x${numUnitsY} base units`);
    
    // Create walls (with cutouts if any)
    console.log('Creating wall shape with cutouts...');
    let wallsModel;
    
    const wallsSketch = wallsShape.sketchOnPlane();
    // Position walls on top of the base and the bottom
    wallsModel = wallsSketch.extrude(wallHeight).translate(0, 0, baseHeight + bottomThickness) as any;
    console.log(`Created walls with height ${wallHeight}mm`);
    
    finalModel = baseModel.fuse(wallsModel, { optimisation: "commonFace" });
    console.log('Successfully created final 3D model by combining base units, bottom, and walls with commonFace optimization');
    
    return finalModel;
  }

  async generateModel(
    outlines: ObjectData[],
    totalHeight: number,
    wallThickness: number,
    baseHeight: number = 4.75
  ): Promise<{ faces: ReplicadFaces; edges: ReplicadEdges } | null> {
    if (outlines.length === 0) {
      return null;
    }
    
    const finalModel = await this.createModel(outlines, totalHeight, wallThickness, baseHeight);
    
    // Generate mesh data for 3D rendering
    const faces = finalModel.mesh({ tolerance: 0.05, angularTolerance: 30 });
    const edges = finalModel.meshEdges();
    
    return { faces, edges };
  }

  async exportSTEP(
    outlines: ObjectData[],
    totalHeight: number,
    wallThickness: number,
    baseHeight: number = 4.75
  ): Promise<Blob> {
    if (outlines.length === 0) {
      throw new Error('No outlines provided for STEP export');
    }
    
    try {
      // Create the model on-demand for this export
      const model = await this.createModel(outlines, totalHeight, wallThickness, baseHeight);
      return await model.blobSTEP();
    } catch (error) {
      console.error('Error generating STEP file:', error);
      throw new Error('Failed to generate STEP file: ' + String(error));
    }
  }
}

// Export the worker with Comlink
Comlink.expose(new ReplicadWorkerImpl());