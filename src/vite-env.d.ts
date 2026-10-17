/// <reference types="vite/client" />

interface Window {
  stormforge?: {
    platform: string;
    isElectron: boolean;
  };
}
