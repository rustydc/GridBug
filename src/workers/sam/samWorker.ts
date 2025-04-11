import * as Comlink from 'comlink';
import { SAMWorkerAPI, DataPoint, MaskResult } from './samWorkerApi';
import * as transformers from '@huggingface/transformers';

// We adopt the singleton pattern to enable lazy-loading of the model and processor.
class SegmentAnythingSingleton {
  static model_id = 'Xenova/sam-vit-large';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static processor: any;
  static quantized = true;

  static async getInstance() {
    // Load model and processor if not already loaded
    if (!this.model) { 
      this.model = await transformers.SamModel.from_pretrained(this.model_id, {
        dtype: "fp16",
        device: 'webgpu'
      });
    }
    
    if (!this.processor) {
      this.processor = await transformers.AutoProcessor.from_pretrained(this.model_id, { revision: "main" });
    }

    return Promise.all([this.model, this.processor]);
  }
}

class SAMWorkerImpl implements SAMWorkerAPI {
  private ready = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private imageEmbeddings: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private imageInputs: any = null;
  private currentImageUrl: string | null = null;
  private isProcessingImage = false;

  async initialize(): Promise<void> {
    try {
      // Initialize model and processor
      [this.model, this.processor] = await SegmentAnythingSingleton.getInstance();
      
      // Indicate that we are ready to accept requests
      this.ready = true;
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw new Error('Failed to initialize model: ' + String(error));
    }
  }

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  async reset(): Promise<void> {
    this.imageInputs = null;
    this.imageEmbeddings = null;
    this.currentImageUrl = null;
  }

  async processImage(imageUrl: string): Promise<void> {
    // Skip if we're already processing this image or if it's the same as the last one
    if (this.isProcessingImage) {
      console.log("Already processing an image, ignoring duplicate request");
      return;
    }
    
    // If this is the same image we already processed, just return
    if (this.currentImageUrl === imageUrl && this.imageEmbeddings) {
      console.log("Same image already processed, skipping reprocessing");
      return;
    }
    
    // Mark that we're processing an image
    this.isProcessingImage = true;
    this.currentImageUrl = imageUrl;
    
    try {
      if (!this.ready) {
        await this.initialize();
      }

      // Read the image and compute embeddings
      const image = await transformers.RawImage.read(imageUrl);
      this.imageInputs = await this.processor(image);
      this.imageEmbeddings = await this.model.get_image_embeddings(this.imageInputs);
    } finally {
      // Mark that we're done processing this image
      this.isProcessingImage = false;
    }
  }

  async generateMask(points: DataPoint[]): Promise<MaskResult> {
    if (!this.imageInputs || !this.imageEmbeddings) {
      throw new Error("Image embeddings not computed. Call processImage first.");
    }

    const reshaped = this.imageInputs.reshaped_input_sizes[0];
    
    // Convert normalized coordinates to actual pixel coordinates
    const pixelPoints = points.map(x => [x.point[0] * reshaped[1], x.point[1] * reshaped[0]]);
    const labels = points.map(x => BigInt(x.label));

    const input_points = new transformers.Tensor(
      'float32',
      pixelPoints.flat(Infinity),
      [1, 1, pixelPoints.length, 2],
    );
    const input_labels = new transformers.Tensor(
      'int64',
      labels.flat(Infinity),
      [1, 1, labels.length],
    );

    // Generate the mask
    const outputs = await this.model({
      ...this.imageEmbeddings,
      input_points,
      input_labels,
    });

    const masks = await this.processor.post_process_masks(
      outputs.pred_masks,
      this.imageInputs.original_sizes,
      this.imageInputs.reshaped_input_sizes
    );

    // Convert the raw image to the expected format
    const rawImage = transformers.RawImage.fromTensor(masks[0][0]);
    
    return {
      mask: {
        data: new Uint8Array(rawImage.data),
        width: rawImage.width,
        height: rawImage.height
      },
      scores: outputs.iou_scores.data,
    };
  }
}

// Export the worker with Comlink
Comlink.expose(new SAMWorkerImpl());