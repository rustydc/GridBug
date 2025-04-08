/**
 * API interface for the SAM worker using Comlink
 */

export interface DataPoint {
  point: [number, number]; // Normalized point coordinates (0-1)
  label: number;           // 1 for positive, 0 for negative
}

export interface MaskResult {
  mask: {
    data: Uint8Array;
    width: number;
    height: number;
  };
  scores: number[];
}

/**
 * Defines the SAM worker API exposed through Comlink
 */
export interface SAMWorkerAPI {
  /**
   * Initializes the model and loads necessary resources
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Processes an image and computes its embeddings
   * @param imageUrl URL of the image to process
   * @returns Promise that resolves when embeddings are computed
   */
  processImage(imageUrl: string): Promise<void>;
  
  /**
   * Generates a mask from the specified points
   * @param points Array of points with label information
   * @returns Promise that resolves with the generated mask
   */
  generateMask(points: DataPoint[]): Promise<MaskResult>;
  
  /**
   * Checks if the worker is ready to process images
   * @returns True if the worker is ready
   */
  isReady(): Promise<boolean>;
  
  /**
   * Resets the worker state
   */
  reset(): Promise<void>;
}