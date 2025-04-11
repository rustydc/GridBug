/// <reference types="vite/client" />

// Type declarations for importing WASM files
declare module '*.wasm?url' {
  const src: string;
  export default src;
}
