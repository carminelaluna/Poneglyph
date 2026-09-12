import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const isExport = process.env.STATIC_EXPORT === '1';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');

function buildIdFromData() {
  const dir = path.resolve('data');
  const hash = createHash('sha256');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    hash.update(name);
    hash.update(readFileSync(path.join(dir, name)));
  }
  return hash.digest('base64url').slice(0, 21);
}

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath: `/${basePath}` } : {}),
  ...(isExport
    ? {
        output: 'export',
        generateBuildId: buildIdFromData,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
