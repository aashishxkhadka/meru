import { describe, expect, it } from '@jest/globals';

import { type LabelCandidate, declutterLabels } from './declutter';

const label = (id: string, anchorX: number, rank = 2, elevationM = 6000, widthPx = 100) =>
  ({ id, anchorX, rank, elevationM, widthPx }) satisfies LabelCandidate;
const W = { screenWidthPx: 400 };

describe('declutterLabels', () => {
  it('places separated labels all in the lowest row, centred on the summit', () => {
    const out = declutterLabels([label('a', 80), label('b', 300)], W);
    expect(out.map((l) => [l.id, l.row])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
    expect(out[0]!.left).toBe(30);
    expect(out[0]!.right).toBe(130);
  });

  it('stacks overlapping labels into higher rows, up to 3', () => {
    const out = declutterLabels(
      [label('a', 200, 2, 7000), label('b', 210, 2, 6900), label('c', 220, 2, 6800)],
      W,
    );
    expect(out.map((l) => l.row)).toEqual([0, 1, 2]);
  });

  it('skips a label that overlaps in every row', () => {
    const out = declutterLabels(
      [
        label('a', 200, 2, 7000),
        label('b', 205, 2, 6900),
        label('c', 210, 2, 6800),
        label('d', 215, 3, 5000),
      ],
      W,
    );
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('places by rank then elevation: rank 1 wins over a higher rank-2 peak', () => {
    const out = declutterLabels([label('big-rank2', 200, 2, 7900), label('rank1', 205, 1, 6000)], {
      ...W,
      rowCount: 1,
    });
    expect(out.map((l) => l.id)).toEqual(['rank1']);
  });

  it('always places rank-1 peaks, even when every row is full', () => {
    const out = declutterLabels(
      [
        label('r1a', 200, 1, 8000),
        label('r1b', 202, 1, 7900),
        label('r1c', 204, 1, 7800),
        label('r1d', 206, 1, 7700),
      ],
      W,
    );
    expect(out).toHaveLength(4);
    expect(out[3]!.forced).toBe(true);
    expect(out.slice(0, 3).every((l) => !l.forced)).toBe(true);
  });

  it('caps at 12 labels', () => {
    const many = Array.from({ length: 30 }, (_, i) => label(`p${i}`, i * 13, 2, 6000, 10));
    expect(declutterLabels(many, W)).toHaveLength(12);
  });

  it('ignores summits off screen and clamps boxes inside the edges', () => {
    const out = declutterLabels([label('off', -5), label('edge', 2), label('right', 399)], W);
    expect(out.map((l) => l.id)).toEqual(['edge', 'right']);
    expect(out[0]!.left).toBe(4);
    expect(out[1]!.right).toBe(396);
  });

  it('slides a crowded rank-1 label sideways instead of overlapping, when allowed', () => {
    const crowd = [
      label('r1a', 200, 1, 8000),
      label('r1b', 202, 1, 7900),
      label('r1c', 204, 1, 7800),
      label('r1d', 206, 1, 7700),
    ];
    const out = declutterLabels(crowd, { ...W, maxShiftPx: 160 });
    const d = out.find((l) => l.id === 'r1d')!;
    expect(d.forced).toBe(false);
    expect(Math.abs(d.shiftPx)).toBeGreaterThanOrEqual(100);
    expect(d.anchorX).toBe(206); // leader still points at the summit
    // no two labels in the same row overlap
    for (const a of out) {
      for (const b of out) {
        if (a !== b && a.row === b.row) expect(a.right <= b.left || b.right <= a.left).toBe(true);
      }
    }
  });

  it('never slides rank-2 labels: they are skipped as the SPEC says', () => {
    const out = declutterLabels(
      [label('a', 200, 1), label('b', 202, 1), label('c', 204, 1), label('d', 206, 2)],
      { ...W, maxShiftPx: 160 },
    );
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses the compact variant for a rank-1 label when the full one cannot fit anywhere', () => {
    const W2 = { screenWidthPx: 220, maxShiftPx: 160 };
    const lbl = (id: string, x: number, e: number, w: number) => ({
      ...label(id, x, 1, e, w),
      compactWidthPx: 50,
    });
    // 3 rows x 2 labels of 70 px at x=40 and x=180 leave a 58 px free gap mid-row
    // (75..145 minus 6 px spacing each side): a 100 px label cannot fit, a 50 px one can.
    const rowsFull = [40, 180, 40, 180, 40, 180].map((x, i) => lbl(`r${i}`, x, 8000 - i, 70));
    const out = declutterLabels([...rowsFull, lbl('g', 110, 7000, 100)], W2);
    expect(out.slice(0, 6).every((l) => !l.compact && !l.forced)).toBe(true);
    const g = out.find((l) => l.id === 'g')!;
    expect(g.compact).toBe(true);
    expect(g.forced).toBe(false);
    expect(g.right - g.left).toBe(50);
  });
});
