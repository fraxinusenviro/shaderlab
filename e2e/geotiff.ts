/** Minimal little-endian float32 GeoTIFF (uncompressed, one strip) for tests. */
export function float32GeoTiff(values: Float32Array, w: number, h: number, pixel: number, originX: number, originY: number, nodata: string): ArrayBuffer {
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3979];
  const ascii = nodata + '\0';
  type Entry = [tag: number, type: number, count: number, data: number[] | string];
  const entries: Entry[] = [
    [256, 4, 1, [w]], [257, 4, 1, [h]], [258, 3, 1, [32]], [259, 3, 1, [1]], [262, 3, 1, [1]],
    [273, 4, 1, [0]], [277, 3, 1, [1]], [278, 4, 1, [h]], [279, 4, 1, [w * h * 4]], [339, 3, 1, [3]],
    [33550, 12, 3, [pixel, pixel, 0]], [33922, 12, 6, [0, 0, 0, originX, originY, 0]],
    [34735, 3, geoKeys.length, geoKeys], [42113, 2, ascii.length, ascii],
  ];
  const size = { 2: 1, 3: 2, 4: 4, 12: 8 } as Record<number, number>;
  const ifdSize = 2 + entries.length * 12 + 4;
  let extra = 8 + ifdSize;
  const extraOffsets = entries.map(([, type, count]) => {
    const bytes = size[type] * count;
    if (bytes <= 4) return -1;
    const at = extra;
    extra += bytes + (bytes % 2);
    return at;
  });
  const dataOffset = extra;
  const buf = new ArrayBuffer(dataOffset + w * h * 4);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x4949, true);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, 8, true);
  dv.setUint16(8, entries.length, true);
  const write = (at: number, type: number, data: number[] | string) => {
    if (typeof data === 'string') [...data].forEach((ch, i) => dv.setUint8(at + i, ch.charCodeAt(0)));
    else data.forEach((v, i) => (type === 3 ? dv.setUint16(at + i * 2, v, true) : type === 4 ? dv.setUint32(at + i * 4, v, true) : dv.setFloat64(at + i * 8, v, true)));
  };
  entries.forEach(([tag, type, count, data], i) => {
    const e = 10 + i * 12;
    dv.setUint16(e, tag, true);
    dv.setUint16(e + 2, type, true);
    dv.setUint32(e + 4, count, true);
    if (tag === 273) data = [dataOffset];
    if (extraOffsets[i] < 0) write(e + 8, type, data);
    else {
      dv.setUint32(e + 8, extraOffsets[i], true);
      write(extraOffsets[i], type, data);
    }
  });
  values.forEach((v, i) => dv.setFloat32(dataOffset + i * 4, v, true));
  return buf;
}
