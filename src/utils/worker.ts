// Dynamically import the transformers library from CDN
// Use a separate function to handle the import to avoid top-level await
let transformersModule: any;

async function loadTransformers() {
  try {
    transformersModule = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3");
    return transformersModule;
  } catch (error) {
    console.error("Failed to load transformers library:", error);
    throw error;
  }
}


interface DataPoint {
    point: [number, number];
    label: number;
}

interface ImageInputs {
    reshaped_input_sizes: [number, number][];
    original_sizes: [number, number][];
}

// We adopt the singleton pattern to enable lazy-loading of the model and processor.
class SegmentAnythingSingleton {
    static model_id = 'Xenova/sam-vit-large';
    static model: any;
    static processor: any;
    static quantized = true;

    static async getInstance() {
        // Load the transformers module if not already loaded
        if (!transformersModule) {
            transformersModule = await loadTransformers();
        }
        
        // Allow downloading models from the Hub
        transformersModule.env.allowLocalModels = false;
        
        // Load model and processor if not already loaded
        if (!this.model) { 
            this.model = transformersModule.SamModel.from_pretrained(this.model_id, {
                dtype: "fp16",
                device: 'webgpu'
            });
        }
        
        if (!this.processor) {
            this.processor = transformersModule.AutoProcessor.from_pretrained(this.model_id);
        }

        return Promise.all([this.model, this.processor]);
    }
}


// State variables
let image_embeddings: any = null;
let image_inputs: ImageInputs | null = null;
let ready = false;
let model: any;
let processor: any;

// Initialize the worker
async function init() {
    try {
        // Load transformers library
        await loadTransformers();
        
        // Initialize model and processor
        [model, processor] = await SegmentAnythingSingleton.getInstance();
        
        // Indicate that we are ready to accept requests
        ready = true;
        self.postMessage({
            type: 'ready',
        });
    } catch (error) {
        console.error('Failed to initialize worker:', error);
        self.postMessage({
            type: 'error',
            error: 'Failed to initialize model: ' + String(error),
        });
    }
}

// Start initialization
init();


self.onmessage = async (e) => {
    console.log(e);

    try {
        if (!transformersModule) {
            self.postMessage({
                type: 'error',
                error: 'Transformers library not loaded yet',
            });
            return;
        }

        const { type, data } = e.data;
        if (type === 'reset') {
            image_inputs = null;
            image_embeddings = null;

        } else if (type === 'segment') {
            // Indicate that we are starting to segment the image
            self.postMessage({
                type: 'segment_result',
                data: 'start',
            });

            console.log("Segmenting.");
            // Read the image and recompute image embeddings
            const image = await transformersModule.RawImage.read(e.data.data);
            image_inputs = await processor(image);
            image_embeddings = await model.get_image_embeddings(image_inputs);

            console.log("Segmented.");

            // Indicate that we have computed the image embeddings, and we are ready to accept decoding requests
            self.postMessage({
                type: 'segment_result',
                data: 'done',
            });

        } else if (type === 'decode') {
            // Prepare inputs for decoding
            console.log("Decoding...");
            if (!image_inputs || !image_embeddings) {
                throw new Error("Image embeddings not computed.");
            }
            const reshaped = image_inputs.reshaped_input_sizes[0];
            
            const points = data.map((x: DataPoint) => [x.point[0] * reshaped[1], x.point[1] * reshaped[0]]);
            const labels = data.map((x: DataPoint) => BigInt(x.label));

            const input_points = new transformersModule.Tensor(
                'float32',
                points.flat(Infinity),
                [1, 1, points.length, 2],
            );
            const input_labels = new transformersModule.Tensor(
                'int64',
                labels.flat(Infinity),
                [1, 1, labels.length],
            );

            // Generate the mask
            const outputs = await model({
                ...image_embeddings,
                input_points,
                input_labels,
            });

            const masks = await processor.post_process_masks(
                outputs.pred_masks,
                image_inputs.original_sizes,
                image_inputs.reshaped_input_sizes
            );

            self.postMessage({
                type: 'decode_result',
                data: {
                    mask: transformersModule.RawImage.fromTensor(masks[0][0]),
                    scores: outputs.iou_scores.data,
                },
            });
        } else {
            throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            type: 'error',
            error: String(error),
        });
    }
}
