import { env, SamModel, AutoProcessor, RawImage, Tensor } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";


// Since we will download the model from the Hugging Face Hub, we can skip the local model check
env.allowLocalModels = false;

interface DataPoint {
    point: [number, number];
    label: number;
}

interface ImageInputs {
    reshaped_input_sizes: [number, number][];
    original_sizes: [number, number][];
}

// We adopt the singleton pattern to enable lazy-loading of the model and processor.
export class SegmentAnythingSingleton {
    static model_id = 'Xenova/sam-vit-large';
    static model: SamModel;
    static processor: AutoProcessor;
    static quantized = true;

    static getInstance() {
        if (!this.model) { 
            this.model = SamModel.from_pretrained(this.model_id, {
                dtype: "fp16",
                //dtype: "fp16", // or "fp32"s
                //device: 'wasm',
                device: 'webgpu'
            });
        }
        if (!this.processor) {
            this.processor = AutoProcessor.from_pretrained(this.model_id);
        }

        return Promise.all([this.model, this.processor]);
    }
}


// State variables
let image_embeddings: Tensor | null = null;


let image_inputs: ImageInputs | null = null;
let ready = false;

const [model, processor] = await SegmentAnythingSingleton.getInstance();

if (!ready) {
    // Indicate that we are ready to accept requests
    ready = true;
    self.postMessage({
        type: 'ready',
    });
}


self.onmessage = async (e) => {
    console.log(e)

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

        console.log("Segmenting.")
        // Read the image and recompute image embeddings
        const image = await RawImage.read(e.data.data);
        image_inputs = await processor(image);
        image_embeddings = await model.get_image_embeddings(image_inputs)

        console.log("Segmented.")

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
        

        const points: [number, number][] = data.map((x: DataPoint) => [x.point[0] * reshaped[1], x.point[1] * reshaped[0]]);
        const labels = data.map(x => BigInt(x.label));

        const input_points = new Tensor(
            'float32',
            points.flat(Infinity),
            [1, 1, points.length, 2],
        );
        const input_labels = new Tensor(
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
                mask: RawImage.fromTensor(masks[0][0]),
                scores: outputs.iou_scores.data,
            },
        });
    } else {
        throw new Error(`Unknown message type: ${type}`);
    }
}
