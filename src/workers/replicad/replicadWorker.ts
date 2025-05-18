/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Comlink from 'comlink';
import { ReplicadWorkerAPI, ReplicadFaces, ReplicadEdges } from './replicadWorkerApi';
import { ObjectData } from '../../types';
import { catmullToBezier } from '../../utils/spline';
import { calculateMinimalGridArea, GRID_SIZE, TOLERANCE } from '../../utils/grid';
import * as replicad from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { memoize } from './memoize';

// Initialization flag
let isReplicadInitialized = false;

// Promise for initialization
let initializationPromise: Promise<void> | null = null;

// Function to initialize replicad with OpenCascade
const initializeReplicad = async (): Promise<void> => {
  if (isReplicadInitialized) return;
  
  if (!initializationPromise) {
    console.log('Initializing replicad with OpenCascade');
    
    initializationPromise = (async () => {
      try {
        console.log('Loading OpenCascade with WASM URL:', opencascadeWasm);
        
        // Initialize OpenCascade.js with the WASM file
        // @ts-expect-error - TypeScript thinks opencascade takes no arguments, but it needs configuration
        const OC = await opencascade({
          locateFile: () => opencascadeWasm
        });
        
        // Inject OpenCascade instance into replicad
        replicad.setOC(OC);
        
        isReplicadInitialized = true;
        console.log('Replicad initialized successfully with OpenCascade');
      } catch (error) {
        console.error('Failed to initialize replicad with OpenCascade:', error);
        initializationPromise = null;
        throw error;
      }
    })();
  }
  
  return initializationPromise;
}

class ReplicadWorkerImpl implements ReplicadWorkerAPI {
  // The createBin method will be assigned in the constructor via memoization
  
  constructor() {
    this.createBin = memoize(this.createBin_.bind(this));
    this.createBaseUnit = memoize(this.createBaseUnit_.bind(this));
    this.createBase = memoize(this.createBase_.bind(this));
    this.createCutoutExtrusion = memoize(this.createCutoutExtrusion_.bind(this));
  }

  async initialize(): Promise<void> {
    try {
      await initializeReplicad();
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw new Error('Failed to initialize replicad: ' + String(error));
    }
  }

  async isReady(): Promise<boolean> {
    return isReplicadInitialized;
  }

  /**
   * Creates a cutout extrusion for a specific outline
   */
  private createCutoutExtrusion: (
    obj: ObjectData,
    min: { x: number, y: number },
    max: { x: number, y: number },
    wallHeight: number
  ) => any;

  /**
   * Creates a cutout extrusion for a specific outline
   */
  private createCutoutExtrusion_(
    obj: ObjectData,
    min: { x: number, y: number },
    max: { x: number, y: number },
    wallHeight: number
  ): any {
    const width = max.x - min.x;
    const height = max.y - min.y;
    let cutoutShape;
    
    if (obj.type === 'roundedRect') {
      // Create a rounded rectangle at the correct position
      // Need to adjust position relative to the grid min
      // NOTE: We negate the X coordinate to correct the left/right flipping in 3D view
      const rectX = -1 * (obj.position.x - min.x - width/2);
      const rectY = obj.position.y - min.y - height/2;
      
      let rectShape;
      // If radius*2 equals both width and height, this is a perfect circle
      if (obj.radius * 2 === obj.width && obj.radius * 2 === obj.height) {
        rectShape = replicad.drawCircle(obj.radius);
      } else {
        // Create rounded rectangle
        rectShape = replicad.drawRoundedRectangle(
          obj.width, 
          obj.height,
          obj.radius
        );
      }
      
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

    // Get the cutout depth (use the shape's depth property, limited by wall height)
    const desiredDepth = obj.depth || 20;
    const cutoutDepth = Math.min(desiredDepth, wallHeight);
    
    // Extrude the cutout shape to its depth and position it at the top of the wall
    const cutoutSketch = cutoutShape.sketchOnPlane("XY", wallHeight - cutoutDepth);
    return cutoutSketch.extrude(cutoutDepth) as any;
  }

  /**
   * Creates and processes cutout shapes for the walls
   */
  private createWallsWithCutouts(
    outlines: ObjectData[],
    baseRect: any,
    min: { x: number, y: number },
    max: { x: number, y: number },
    wallHeight: number
  ): any {
    const width = max.x - min.x;
    const height = max.y - min.y;
    
    // Start with the base rectangle extrusion as the wall shape
    const wallsSketch = baseRect.sketchOnPlane();
    let wallsModel = wallsSketch.extrude(wallHeight) as any;
    
    // Process each outline as an individual extrusion to subtract
    for (const obj of outlines) {
      // Create and cache cutout extrusion
      const cutoutExtrusion = this.createCutoutExtrusion(obj, min, max, wallHeight);
      
      // Subtract the extrusion from the walls
      wallsModel = wallsModel.cut(cutoutExtrusion);
    }
    
    return wallsModel;
  }
  
  private createBaseUnit: (
    baseHeight: number,
    outerDim: number,
    BIN_CORNER_RADIUS: number
  ) => any;
  
  /**
   * Creates a single standard base unit
   */
  private createBaseUnit_(baseHeight: number, outerDim: number, BIN_CORNER_RADIUS: number): any {
    // Create a single base unit with beveled profile
    // Create profiles for lofting
    const topProfile = replicad.drawRoundedRectangle(outerDim, outerDim, BIN_CORNER_RADIUS);
    const middleProfile = topProfile.offset(-2.15/2);
    const bottomProfile = middleProfile.offset(-0.8/2);
    
    // Heights for the profiles
    const topHeight = baseHeight; // Top of the base
    const middleHeight = topHeight - 2.15; // After first 45-degree slope
    const flatHeight = middleHeight - 1.8; // After vertical section
    const bottomHeight = 0; // Bottom of the base
    
    // Create sketches at different heights using the proper replicad API
    const topSketch = topProfile.sketchOnPlane("XY", topHeight) as any;
    const middleSketch = middleProfile.sketchOnPlane("XY", middleHeight) as any;
    const flatSketch = middleProfile.sketchOnPlane("XY", flatHeight) as any;
    const bottomSketch = bottomProfile.sketchOnPlane("XY", bottomHeight) as any;
    
    // Create the base unit by lofting through the profiles
    return topSketch.loftWith([middleSketch, flatSketch, bottomSketch], {ruled: true}) as any;
  }
  
  /**
   * Creates a 1mm thick bottom for the bin
   */
  private createBottom(width: number, height: number, radius: number, baseHeight: number): any {
    console.log('Creating bin bottom...');
    const bottomThickness = 1.0; // 1mm thick bottom
    
    // Create the base rectangle
    const baseRect = replicad.drawRoundedRectangle(width, height, radius);
    
    // Create the bottom as a simple extrusion of the base rectangle
    const binBottomSketch = baseRect.sketchOnPlane("XY", baseHeight);
    const bottomModel = binBottomSketch.extrude(bottomThickness) as any;
    console.log(`Created ${bottomThickness}mm thick bin bottom`);
    
    return bottomModel;
  }
  
  private createBase: (
    width: number,
    height: number,
    radius: number,
    baseHeight: number
  ) => any;
  /**
   * Creates the gridded base structure with base units and bottom
   */
  private createBase_(width: number, height: number, radius: number, baseHeight: number): any {
    // Top size - use GRID_SIZE - TOLERANCE for the outer dimension
    const outerDim = GRID_SIZE - TOLERANCE; // 41.5mm
    
    // Create the bottom first
    const bottomModel = this.createBottom(width, height, radius, baseHeight);
    
    // Create a single base unit
    const baseUnit = this.createBaseUnit(baseHeight, outerDim, radius);
    
    // Calculate how many grid cells fit in the total area
    const numUnitsX = Math.round(width / GRID_SIZE);
    const numUnitsY = Math.round(height / GRID_SIZE);
    
    console.log(`Creating grid of ${numUnitsX}x${numUnitsY} units`);
    
    // Start with the bottom model
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
    return baseModel;
  }
  
  private createBin: (
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight?: number
  ) => any;

  /**
   * Creates a bin model with base units, bottom, and walls
   */
  private createBin_(
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight: number = 4.75
  ): any {
    // Calculate the minimal grid area to get the base rectangle size
    const { min, max } = calculateMinimalGridArea(outlines);
    console.log('Grid area:', { min, max });
    
    // Calculate dimensions
    const width = max.x - min.x;
    const height = max.y - min.y;
    
    // Constants for the bin
    const BIN_CORNER_RADIUS = 7.5 / 2; // Base corner radius in mm
    const wallHeight = totalHeight - baseHeight - 1; // Calculate the wall height
    const bottomThickness = 1.0; // 1mm thick bottom
    
    // Create the base and bottom
    const baseModel = this.createBase(width, height, BIN_CORNER_RADIUS, baseHeight);
    
    // Create walls with cutouts
    const baseRect = replicad.drawRoundedRectangle(width, height, BIN_CORNER_RADIUS);
    
    // Create walls with cutouts directly as a 3D model
    console.log('Creating walls with cutouts...');
    const wallsModel = this.createWallsWithCutouts(outlines, baseRect, min, max, wallHeight)
      .translate(0, 0, baseHeight + bottomThickness) as any;
    console.log(`Created walls with height ${wallHeight}mm`);
    
    // Combine base and walls
    const finalModel = baseModel.fuse(wallsModel, { optimisation: "commonFace" });
    console.log('Successfully created final 3D model by combining base units, bottom, and walls with commonFace optimization');
    
    return finalModel;
  }

  /**
   * Helper method to create a 3D model
   */
  private async createModel(
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight: number = 4.75
  ): Promise<any> {
    // Make sure replicad is initialized
    if (!isReplicadInitialized) {
      await initializeReplicad();
    }

    console.log('Creating model from outlines:', outlines.length);
    
    return this.createBin(outlines, totalHeight, baseHeight);
  }

  /**
   * Generate a cache key from the model parameters
   */
  private generateCacheKey(
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight: number
  ): string {
    // Create a hash from outlines - similar to the hash function in replicadQueries.ts
    const outlinesHash = outlines.map(outline => {
      switch (outline.type) {
        case 'roundedRect':
          return `rect:${outline.id}:${outline.width}:${outline.height}:${outline.radius}:${outline.position.x}:${outline.position.y}:${outline.rotation}:${outline.depth}`;
        case 'spline': {
          const pointsHash = outline.points.map(p => `${p.x},${p.y}`).join(';');
          return `spline:${outline.id}:${outline.position.x}:${outline.position.y}:${outline.rotation}:${outline.depth}:${pointsHash}`;
        }
      }
    }).join('|');
    
    // Combine with other parameters to create a unique key
    return `model:${outlinesHash}:${totalHeight}:${baseHeight}`;
  }

  async generateModel(
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight: number = 4.75
  ): Promise<{ faces: ReplicadFaces; edges: ReplicadEdges } | null> {
    if (outlines.length === 0) {
      return null;
    }

    const finalModel = await this.createModel(outlines, totalHeight, baseHeight);
    
    // Generate mesh data for 3D rendering
    const faces = finalModel.mesh({ tolerance: 0.05, angularTolerance: 30 });
    const edges = finalModel.meshEdges();
    
    return { faces, edges };
  }

  async exportSTEP(
    outlines: ObjectData[],
    totalHeight: number,
    baseHeight: number = 4.75
  ): Promise<Blob> {
    if (outlines.length === 0) {
      throw new Error('No outlines provided for STEP export');
    }
    
    try {
      const model = await this.createModel(outlines, totalHeight, baseHeight);
      return await model.blobSTEP();
    } catch (error) {
      console.error('Error generating STEP file:', error);
      throw new Error('Failed to generate STEP file: ' + String(error));
    }
  }
}

// Export the worker with Comlink
Comlink.expose(new ReplicadWorkerImpl());