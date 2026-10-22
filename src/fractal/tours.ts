/**
 * Curated zoom destinations. Coordinates were computed for Shader Forge with
 * 110-digit arithmetic: minibrot nuclei via ball-period detection + Newton's
 * method on z_p(c) = 0, and Misiurewicz points via Newton on z_{k+p} = z_k.
 * A minibrot tour ends on a perfect miniature copy of the set; a Misiurewicz
 * tour is self-similar at every scale and can be zoomed until precision runs out.
 */
export interface FractalTour {
  id: string;
  name: string;
  kind: 'minibrot' | 'spiral' | 'dendrite';
  description: string;
  re: string;
  im: string;
  /** Final depth as log10 of magnification. */
  depth: number;
  /** Period (minibrot) or preperiod/period (Misiurewicz) for the info panel. */
  detail: string;
  /** Suggested minimum iterations at full depth. */
  minIter?: number;
  /** Optional palette id. */
  palette?: string;
}

export const FRACTAL_TOURS: FractalTour[] = [
  {
    id: 'seahorse-minibrot',
    name: 'Seahorse Valley minibrot',
    kind: 'minibrot',
    description: 'Down through the seahorse spirals to a period-998 miniature Mandelbrot set about 10^-15 across.',
    re: '-0.743643887037158870778064543493642575047609962321255060213887',
    im: '0.131825904205312292821097354874767265262988599679042974937476',
    depth: 14.8,
    detail: 'Nucleus of period 998, size ≈ 6.3·10⁻¹⁶',
    minIter: 6000,
    palette: 'electric',
  },
  {
    id: 'triple-minibrot',
    name: 'Triple-spiral minibrot',
    kind: 'minibrot',
    description: 'Into the triple-spiral valley to a period-119 minibrot.',
    re: '-0.0882990883882490990715478638347899078856175001766922143493729',
    im: '0.654400367964259455848273769051731985116509311064608393997188',
    depth: 9.35,
    detail: 'Nucleus of period 119, size ≈ 1.7·10⁻¹⁰',
    minIter: 2500,
    palette: 'sunset',
  },
  {
    id: 'triple-deep',
    name: 'Deep triple-spiral minibrot',
    kind: 'minibrot',
    description: 'A longer dive past nested spirals to a period-387 minibrot 10^-18 across.',
    re: '-0.0882999998919516055227221975820178372618149473616719089498608',
    im: '0.654399999953588469413985328863154805796621021949249039767511',
    depth: 17.6,
    detail: 'Nucleus of period 387, size ≈ 1.0·10⁻¹⁸',
    minIter: 6000,
    palette: 'ocean',
  },
  {
    id: 'seahorse-spiral',
    name: 'Endless seahorse spiral',
    kind: 'spiral',
    description: 'A Misiurewicz point in Seahorse Valley: double spirals that repeat at every scale.',
    re: '-0.7746724469356738080461171765322245435665009634996757197',
    im: '0.137429292340916890591543464097869529007304705906938161',
    depth: 28,
    detail: 'Misiurewicz point M(22,1)',
    palette: 'classic',
  },
  {
    id: 'elephant-spiral',
    name: 'Elephant Valley spiral',
    kind: 'spiral',
    description: 'Trunks curling into an endless spiral in Elephant Valley.',
    re: '0.2892573747165705764102686553397904178666430767512063339',
    im: '0.01339117893975986797363346873824449315562049544311080055',
    depth: 28,
    detail: 'Misiurewicz point M(16,1)',
    palette: 'fire',
  },
  {
    id: 'dendrite-branch',
    name: 'Dendrite branch point',
    kind: 'dendrite',
    description: 'A branch point of the dendrite filaments above the main cardioid.',
    re: '-0.1010963638456221610257854457386225654638054428262534839',
    im: '0.95628651080914150077109605772997743580983333651052917',
    depth: 28,
    detail: 'Misiurewicz point M(4,1)',
    palette: 'ice',
  },
  {
    id: 'c-equals-i',
    name: 'c = i',
    kind: 'dendrite',
    description: 'The exact point c = i, where three filaments meet forever.',
    re: '0',
    im: '1',
    depth: 28,
    detail: 'Misiurewicz point M(2,2) — exact',
    palette: 'mono',
  },
];
