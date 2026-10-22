/**
 * EPSG:3979 — NAD83(CSRS) / Canada Atlas Lambert: Lambert Conformal Conic
 * (2SP) on GRS80; lat1 = 49°, lat2 = 77°, lat0 = 49°, lon0 = -95°, no false
 * easting/northing. Formulas after Snyder, "Map Projections — A Working
 * Manual" (USGS PP 1395), §15. NAD83(CSRS) and WGS84 differ by < 2 m, well
 * below the resolution used here.
 */
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;
const LAT1 = 49 * RAD;
const LAT2 = 77 * RAD;
const LAT0 = 49 * RAD;
const LON0 = -95 * RAD;

const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
const t = (phi: number) => {
  const s = E * Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (E / 2);
};
const M1 = m(LAT1);
const M2 = m(LAT2);
const T1 = t(LAT1);
const T2 = t(LAT2);
const N = (Math.log(M1) - Math.log(M2)) / (Math.log(T1) - Math.log(T2));
const FF = M1 / (N * T1 ** N);
const RHO0 = A * FF * t(LAT0) ** N;

/** Longitude/latitude (degrees) → EPSG:3979 metres. */
export function toLcc(lon: number, lat: number): [number, number] {
  const rho = A * FF * t(lat * RAD) ** N;
  const theta = N * (lon * RAD - LON0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

/** EPSG:3979 metres → longitude/latitude (degrees). */
export function fromLcc(x: number, y: number): [number, number] {
  const dy = RHO0 - y;
  const rho = Math.sign(N) * Math.hypot(x, dy);
  const theta = Math.atan2(Math.sign(N) * x, Math.sign(N) * dy);
  const tt = (rho / (A * FF)) ** (1 / N);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 15; i++) {
    const s = E * Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(tt * ((1 - s) / (1 + s)) ** (E / 2));
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }
  return [(theta / N + LON0) / RAD, phi / RAD];
}
