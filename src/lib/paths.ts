const RAW = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const BASE_PATH = RAW ? `/${RAW.replace(/^\/+|\/+$/g, '')}` : '';

export const asset = (path: string) => `${BASE_PATH}/${path.replace(/^\/+/, '')}`;

export const dataUrl = (path: string) => asset(`data/${path.replace(/^\/+/, '')}`);
