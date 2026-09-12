export const CDN_BUNDLES = 2;

export function cdnShardOf(printingId) {
  let hash = 2166136261;
  const key = String(printingId);
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CDN_BUNDLES;
}

export const bundleDir = (shard) => String.fromCharCode(97 + shard);
