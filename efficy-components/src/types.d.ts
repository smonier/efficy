/// <reference types="vite/client" />

declare global {
  interface Window {
    contextJsParameters?: {
      contextPath?: string;
    };
  }
}

export {};
