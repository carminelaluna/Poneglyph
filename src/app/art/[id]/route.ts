import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MIRROR_DIR = path.resolve(process.cwd(), 'public', 'cards');

const UPSTREAMS = [
  (id: string) => `https://en.onepiece-cardgame.com/images/cardlist/card/${id}.png`,
  (id: string) => `https://optcgapi.com/media/static/Card_Images/${id}.jpg`,
];

const VALID_ID = /^[A-Za-z0-9]{1,8}-\d{1,4}(_[a-z]\d*)?$/;

const YEAR = 60 * 60 * 24 * 365;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!VALID_ID.test(id)) {
    return new NextResponse('Not a card id', { status: 400 });
  }

  const mirrored = path.join(MIRROR_DIR, `${id}.png`);
  try {
    const local = await readFile(mirrored);
    return image(local, 'image/png', 'mirror');
  } catch {
  }

  for (const upstream of UPSTREAMS) {
    const url = upstream(id);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'poneglyph/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') ?? 'image/png';
      if (!type.startsWith('image/')) continue;

      const bytes = Buffer.from(await res.arrayBuffer());
      void mkdir(MIRROR_DIR, { recursive: true })
        .then(() => writeFile(mirrored, bytes))
        .catch(() => {});

      return image(bytes, type, 'upstream');
    } catch {
    }
  }

  return new NextResponse('Card art unavailable', {
    status: 404,
    headers: { 'cache-control': 'public, max-age=300' },
  });
}

function image(body: Buffer, type: string, source: string) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': type,
      'content-length': String(body.byteLength),
      'cache-control': `public, max-age=${YEAR}, immutable`,
      'x-art-source': source,
    },
  });
}
