/// <reference types="vite/client" />

// Type declarations for importing WASM files
declare module '*.wasm?url' {
  const src: string;
  export default src;
}

// Define a type for the imported module to avoid TS errors
declare module 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any;
  export default content;
}