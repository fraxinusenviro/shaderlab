/**
 * Resolves channel bindings ('builtin:*' or stored asset ids) into texture
 * sources. The asset loader is injected by the storage layer so the
 * renderer stays independent of persistence.
 */
import { builtinTexture } from './textures';

type AssetLoader = (id: string) => Promise<Blob | null>;
let loader: AssetLoader = async () => null;
const bitmapCache = new Map<string, Promise<TexImageSource | null>>();

export function setAssetLoader(fn: AssetLoader): void {
  loader = fn;
}

export function resolveChannel(assetId: string): Promise<TexImageSource | null> {
  if (assetId.startsWith('builtin:')) return Promise.resolve(builtinTexture(assetId));
  let p = bitmapCache.get(assetId);
  if (!p) {
    p = loader(assetId).then(async (blob) => {
      if (!blob) return null;
      try {
        // Draw into a canvas: UNPACK_FLIP_Y is not honoured for ImageBitmap
        // uploads in every browser, but is for canvases. Also caps size.
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        return c;
      } catch {
        return null;
      }
    });
    bitmapCache.set(assetId, p);
  }
  return p;
}

export function forgetChannel(assetId: string): void {
  bitmapCache.delete(assetId);
}
