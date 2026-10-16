# Shaders

Volume raymarching for clouds/rain lives in `src/render/CloudRainRenderer.ts` (GLSL3, WebGL2 `sampler3D`).

Future GPU fluid passes can be added here as `.glsl` files and imported via Vite `?raw`.
