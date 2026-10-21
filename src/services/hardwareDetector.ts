import { HardwareCapabilities } from '../types';

let cachedCapabilities: HardwareCapabilities | null = null;

export async function detectHardwareCapabilities(): Promise<HardwareCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const deviceMemoryGB = typeof navigator !== 'undefined' && 'deviceMemory' in navigator
    ? (navigator as any).deviceMemory
    : (isIOS ? 4 : 8);

  let hasWebGPU = false;
  let adapterInfo = '';

  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        hasWebGPU = true;
        if ('info' in adapter) {
          adapterInfo = `${adapter.info.vendor || ''} ${adapter.info.architecture || ''}`.trim();
        } else {
          adapterInfo = 'WebGPU Compatible';
        }
      }
    } catch (e) {
      console.warn('WebGPU no disponible o restringido:', e);
    }
  }

  let isPersisted = false;
  let storageQuotaMB: number | undefined;
  let storageUsedMB: number | undefined;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      if (navigator.storage.persisted) {
        isPersisted = await navigator.storage.persisted();
      }
      if (!isPersisted && navigator.storage.persist) {
        isPersisted = await navigator.storage.persist();
      }
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.quota) storageQuotaMB = Math.round(est.quota / (1024 * 1024));
        if (est.usage) storageUsedMB = Math.round(est.usage / (1024 * 1024));
      }
    } catch (e) {
      console.warn('Error al verificar almacenamiento persistente:', e);
    }
  }

  cachedCapabilities = {
    hasWebGPU,
    adapterInfo,
    deviceMemoryGB,
    hardwareConcurrency,
    isIOS,
    storageQuotaMB,
    storageUsedMB,
    isPersisted,
  };

  return cachedCapabilities;
}

export function evaluateSuitability(
  tier: 'light' | 'medium' | 'heavy' | undefined,
  caps: HardwareCapabilities,
  task: 'script' | 'image' | 'voice'
): 'recommended' | 'slow' | 'may_crash' {
  if (!tier) return 'recommended';

  if (tier === 'light') {
    return 'recommended';
  }

  if (tier === 'medium') {
    if (caps.isIOS && (!caps.deviceMemoryGB || caps.deviceMemoryGB < 6)) {
      return 'slow';
    }
    return caps.deviceMemoryGB && caps.deviceMemoryGB < 4 ? 'slow' : 'recommended';
  }

  // Heavy tier
  if (tier === 'heavy') {
    if (caps.isIOS) {
      return 'may_crash';
    }
    if (!caps.hasWebGPU && task === 'image') {
      return 'may_crash';
    }
    if (caps.deviceMemoryGB && caps.deviceMemoryGB < 8) {
      return 'slow';
    }
    return caps.hasWebGPU ? 'recommended' : 'slow';
  }

  return 'recommended';
}
