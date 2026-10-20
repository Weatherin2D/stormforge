/**
 * WebGPU device selection and capability probing.
 *
 * Queries the adapter limits that govern buffer binding and compute dispatch,
 * so tiling and buffer sizing are driven by the actual device rather than
 * assumed defaults. Returns null when WebGPU is unavailable so the shell can
 * fall back to the CPU FluidSolver.
 */

export interface WebGPULimits {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupsPerX: number;
  maxComputeWorkgroupsPerY: number;
  maxComputeWorkgroupsPerZ: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeWorkgroupSizeY: number;
  maxComputeWorkgroupSizeZ: number;
  maxStorageBufferBindingsPerFragmentStage: number;
  maxStorageBufferBindingsPerComputeStage: number;
}

/** Preferred compute workgroup tile (x, y). Kept within every device's limits. */
export const WORKGROUP_TILE_X = 16;
export const WORKGROUP_TILE_Y = 16;

export class WebGPUDevice {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly limits: WebGPULimits;
  readonly supported: boolean;

  private constructor(adapter: GPUAdapter, device: GPUDevice, queue: GPUQueue) {
    this.adapter = adapter;
    this.device = device;
    this.queue = queue;
    const d = device.limits;
    this.limits = {
      maxStorageBufferBindingSize: d.maxStorageBufferBindingSize,
      maxBufferSize: d.maxBufferSize,
      maxComputeWorkgroupsPerX: d.maxComputeWorkgroupsPerDimension,
      maxComputeWorkgroupsPerY: d.maxComputeWorkgroupsPerDimension,
      maxComputeWorkgroupsPerZ: d.maxComputeWorkgroupsPerDimension,
      maxComputeWorkgroupSizeX: d.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: d.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: d.maxComputeWorkgroupSizeZ,
      maxStorageBufferBindingsPerFragmentStage: d.maxStorageBuffersPerShaderStage,
      maxStorageBufferBindingsPerComputeStage: d.maxStorageBuffersPerShaderStage,
    };
    this.supported = true;
  }

  /** Request a WebGPU device, or null if unavailable. */
  static async request(): Promise<WebGPUDevice | null> {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      return null;
    }
    const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
    if (!gpu) return null;
    let adapter: GPUAdapter | null = null;
    try {
      adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    } catch {
      try {
        adapter = await gpu.requestAdapter({});
      } catch {
        return null;
      }
    }
    if (!adapter) return null;
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch {
      return null;
    }
    return new WebGPUDevice(adapter, device, device.queue);
  }

  /** Create a GPUBuffer with usage flags, zero-initialized. */
  createBuffer(
    byteLength: number,
    usage: GPUBufferUsageFlags,
    mappedAtCreation = false,
  ): GPUBuffer {
    return this.device.createBuffer({
      size: byteLength,
      usage,
      mappedAtCreation,
    });
  }

  /** Create a readback (map-ready) buffer for GPU→CPU copies. */
  createReadbackBuffer(byteLength: number): GPUBuffer {
    return this.device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  /** Write a typed array into an existing buffer at an offset. */
  writeBuffer(buffer: GPUBuffer, data: ArrayBuffer, offset = 0): void {
    this.queue.writeBuffer(buffer, offset, data);
  }

  /** Copy src buffer → dst buffer. */
  copyBuffer(src: GPUBuffer, srcOffset: number, dst: GPUBuffer, dstOffset: number, size: number): void {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(src, srcOffset, dst, dstOffset, size);
    this.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.device.destroy();
  }
}
