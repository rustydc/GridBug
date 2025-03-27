/**
 * Potrace parameter options
 */
declare interface PotraceParameters {
  /** How to resolve ambiguities in path decomposition (default: "minority") */
  turnpolicy?: "black" | "white" | "left" | "right" | "minority" | "majority";
  /** Suppress speckles of up to this size (default: 2) */
  turdsize?: number;
  /** Turn on/off curve optimization (default: true) */
  optcurve?: boolean;
  /** Corner threshold parameter (default: 1) */
  alphamax?: number;
  /** Curve optimization tolerance (default: 0.2) */
  opttolerance?: number;
}

/**
 * Potrace is a library for tracing a bitmap to vector graphics
 */
declare const Potrace: {
  /**
   * Load image from a URL
   * @param url URL of the image to load
   */
  loadImageFromUrl(url: string): void;

  /**
   * Process the loaded image with Potrace algorithm
   * @param callback Function to call when processing is complete
   */
  process(callback?: () => void): void;

  /**
   * Get SVG string from processed image
   * @param size Scale factor for the result image (result_size = original_size * size)
   * @param opt_type Optional parameter, can be "curve" to output curves instead of filled paths
   * @returns SVG string representation of the traced image
   */
  getSVG(size: number, opt_type?: string): string;

  /**
   * Set Potrace parameters
   * @param params Object containing parameters to set
   */
  setParameter(params: Partial<PotraceParameters>): void;

  /**
   * Load image from File API
   * @param file File object from input element or drag and drop
   */
  loadImageFromFile(file: File): void;

  /**
   * The image element used internally
   */
  img: HTMLImageElement;
};

export = Potrace;