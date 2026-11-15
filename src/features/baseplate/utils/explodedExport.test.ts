import { describe, it, expect } from 'vitest';
import type { MarginPiece, ResolvedBaseplateParams } from '@/shared/types/bin';
import { buildSTLBuffer } from '@/shared/generation/export';
import { layoutExplodedParts, packExplodedFile, wholePlatePiece } from './explodedExport';
import type { ExplodedPiece, Soup } from './explodedExport';

/** An axis-aligned box as a triangle soup (two triangles per face). */
function boxSoup(x0: number, x1: number, y0: number, y1: number, z0 = 0, z1 = 5): Soup {
  const c = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [2, 3, 7, 2, 7, 6],
    [1, 2, 6, 1, 6, 5],
    [3, 0, 4, 3, 4, 7],
  ];
  const vertices = new Float32Array(faces.flat().flatMap((i) => c[i]));
  return { vertices, normals: new Float32Array(vertices.length) };
}

function bounds(soup: Soup) {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < soup.vertices.length; i += 3) {
    xs.push(soup.vertices[i]);
    ys.push(soup.vertices[i + 1]);
    zs.push(soup.vertices[i + 2]);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
  };
}

const piece = (o: Partial<ExplodedPiece>): ExplodedPiece => ({
  label: 'A1',
  col: 0,
  row: 0,
  gridOffsetX: 0,
  gridOffsetY: 0,
  widthUnits: 1,
  depthUnits: 1,
  placementRotationDeg: 0,
  ...o,
});

const base = { totalWidthUnits: 2, totalDepthUnits: 1, gridUnitMm: 42, gridUnitMmY: 42 };

describe('layoutExplodedParts', () => {
  it('spreads two pieces apart along their row, each resting on the bed', () => {
    const soup = boxSoup(-21, 21, -21, 21, 3, 8);
    const parts = layoutExplodedParts({
      ...base,
      plates: [
        { piece: piece({ label: 'A1' }), soup },
        { piece: piece({ label: 'B1', col: 1, gridOffsetX: 1 }), soup },
      ],
      rails: [],
    });
    const [a, b] = parts.map((p) => bounds(p.soup));
    expect(parts.map((p) => p.name)).toEqual(['A1', 'B1']);
    expect(a.minX).toBeCloseTo(-42);
    expect(b.minX - a.maxX).toBeCloseTo(10);
    expect(a.minZ).toBeCloseTo(0);
  });

  it('widens the gap when a tongue would reach the neighbour', () => {
    // A1 carries a 12 mm tongue on its right side.
    const parts = layoutExplodedParts({
      ...base,
      plates: [
        { piece: piece({ label: 'A1' }), soup: boxSoup(-21, 33, -21, 21) },
        { piece: piece({ label: 'B1', col: 1, gridOffsetX: 1 }), soup: boxSoup(-21, 21, -21, 21) },
      ],
      rails: [],
    });
    const [a, b] = parts.map((p) => bounds(p.soup));
    expect(b.minX - a.maxX).toBeGreaterThanOrEqual(2);
  });

  it('turns a 180° piece about its own centre', () => {
    const parts = layoutExplodedParts({
      ...base,
      totalWidthUnits: 1,
      plates: [{ piece: piece({ placementRotationDeg: 180 }), soup: boxSoup(-21, 30, -21, 21) }],
      rails: [],
    });
    const b = bounds(parts[0].soup);
    expect(b.minX).toBeCloseTo(-30);
    expect(b.maxX).toBeCloseTo(21);
  });

  it('steps a rail outward and lines the keys up in front', () => {
    const rail = {
      id: 'margin-front-A',
      side: 'front',
      col: 0,
      row: 0,
      worldOffsetMm: { x: 0, y: -24 },
    } as MarginPiece;
    const parts = layoutExplodedParts({
      ...base,
      totalWidthUnits: 1,
      plates: [
        {
          piece: wholePlatePiece({ totalWidthUnits: 1, totalDepthUnits: 1 }),
          soup: boxSoup(-21, 21, -21, 21),
        },
      ],
      rails: [{ margin: rail, soup: boxSoup(-21, 21, -3, 3) }],
      key: { soup: boxSoup(0, 10, 0, 4), count: 5 },
    });
    expect(parts.map((p) => p.name)).toEqual([
      'body',
      'margin-front-A',
      'key_1',
      'key_2',
      'key_3',
      'key_4',
      'key_5',
    ]);
    const body = bounds(parts[0].soup);
    const railBox = bounds(parts[1].soup);
    expect(body.minY - railBox.maxY).toBeGreaterThanOrEqual(2);
    const keys = parts.slice(2).map((p) => bounds(p.soup));
    for (const k of keys) expect(k.maxY).toBeLessThan(railBox.minY);
    // Three keys fit the 42 mm width per row.
    expect(new Set(keys.map((k) => Math.round(k.minY))).size).toBe(2);
  });
});

describe('packExplodedFile', () => {
  it('writes one STL holding every part', async () => {
    const key = boxSoup(0, 10, 0, 4);
    const keyStl = buildSTLBuffer(key.vertices, key.normals, 'key');
    const bridge = {
      exportMargin: () => Promise.reject(new Error('no rails')),
      exportConnectorKey: () => Promise.resolve({ data: keyStl, fileName: 'key.stl' }),
    };
    const data = await packExplodedFile(
      bridge as unknown as Parameters<typeof packExplodedFile>[0],
      {
        plates: [
          { piece: piece({ label: 'A1' }), soup: boxSoup(-21, 21, -21, 21) },
          {
            piece: piece({ label: 'B1', col: 1, gridOffsetX: 1 }),
            soup: boxSoup(-21, 21, -21, 21),
          },
        ],
        margins: [],
        keyCount: 2,
        tiling: { totalWidthUnits: 2, totalDepthUnits: 1 },
        params: { gridUnitMm: 42 } as ResolvedBaseplateParams,
        nozzleMm: 0.4,
      },
      'stl',
      'plate',
      { layerHeightMm: 0.2, infillPercent: 15 }
    );
    expect(new DataView(data).getUint32(80, true)).toBe(4 * 12);
  });
});
