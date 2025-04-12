/**
 * API interface for the Replicad worker using Comlink
 */
import { ObjectData } from '../../types';

// Define interfaces for faces and edges matching ReplicadMesh component
export interface ReplicadFaces {
  readonly indices: number[];
  readonly vertices: number[];
  readonly triangles: number[];
  readonly normals?: number[];
  readonly faceGroups?: { start: number; count: number; faceId: number; }[];
}

export interface ReplicadEdges {
  readonly vertices: number[];
  readonly lines: number[];
  readonly edgeGroups?: { start: number; count: number; edgeId: number; }[];
}

/**
 * Defines the Replicad worker API exposed through Comlink
 */
export interface ReplicadWorkerAPI {
  /**
   * Initializes replicad with OpenCascade WASM
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Checks if the worker is ready to process models
   * @returns True if the worker is ready
   */
  isReady(): Promise<boolean>;
  
  /**
   * Generates a 3D model from outlines
   * @param outlines Array of object data to process
   * @param totalHeight The total height of the bin in mm
   * @param baseHeight Optional base height in mm (default 4.75mm)
   * @returns Promise that resolves with the model data
   */
  generateModel(outlines: ObjectData[], totalHeight: number, baseHeight?: number): Promise<{
    faces: ReplicadFaces;
    edges: ReplicadEdges;
  } | null>;
  
  /**
   * Export a model as STEP format
   * @param outlines Array of object data to process
   * @param totalHeight The total height of the bin in mm
   * @param baseHeight Optional base height in mm (default 4.75mm)
   * @returns Promise with the STEP data as a blob
   */
  exportSTEP(outlines: ObjectData[], totalHeight: number, baseHeight?: number): Promise<Blob>;
}