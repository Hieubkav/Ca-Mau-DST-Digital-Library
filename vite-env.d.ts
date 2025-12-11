/// <reference types="vite/client" />

// PDF.js worker module declaration for Vite ?url import
declare module 'pdfjs-dist/build/pdf.worker.min.js?url' {
  const url: string;
  export default url;
}

// Audio files
declare module '*.mp3' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
