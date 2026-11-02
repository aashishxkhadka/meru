/**
 * Label placement (SPEC 6.6). Pure TypeScript.
 *
 * Candidates are peaks visible on screen. They are placed by rank, then elevation, into up to
 * `rowCount` horizontal rows above the skyline (row 0 = lowest, nearest the skyline). A label
 * goes into the first row where its box does not overlap an already placed label; if it
 * overlaps in every row it is skipped, except rank-1 peaks, which are always placed (in the
 * least crowded row). At most `maxLabels` labels.
 */

export interface LabelCandidate {
  id: string;
  rank: number;
  elevationM: number;
  /** Screen x of the summit; the label box is centred on it (clamped to the screen). */
  anchorX: number;
  widthPx: number;
  /** Narrower one-line variant (e.g. name only), tried for rank 1 before overlapping. */
  compactWidthPx?: number;
}

export interface DeclutterOptions {
  screenWidthPx: number;
  rowCount?: number;
  maxLabels?: number;
  /** Minimum horizontal gap between labels in the same row. */
  gapPx?: number;
  /** Keep label boxes this far inside the screen edges. */
  edgeMarginPx?: number;
  /**
   * Rank-1 labels that overlap in every row may slide sideways up to this far to a free spot
   * (the leader line then angles to the summit) before being placed overlapping. Default 0.
   */
  maxShiftPx?: number;
}

export interface PlacedLabel {
  id: string;
  row: number;
  left: number;
  right: number;
  anchorX: number;
  /** True if a rank-1 label had to be placed despite overlapping in every row. */
  forced: boolean;
  /** How far the label box was slid sideways from its natural position (rank 1 only). */
  shiftPx: number;
  /** True if the compact variant was used. */
  compact: boolean;
}

export const DEFAULT_ROW_COUNT = 3;
export const DEFAULT_MAX_LABELS = 12;

export function declutterLabels(
  candidates: readonly LabelCandidate[],
  options: DeclutterOptions,
): PlacedLabel[] {
  const rowCount = options.rowCount ?? DEFAULT_ROW_COUNT;
  const maxLabels = options.maxLabels ?? DEFAULT_MAX_LABELS;
  const gapPx = options.gapPx ?? 6;
  const margin = options.edgeMarginPx ?? 4;
  const maxShiftPx = options.maxShiftPx ?? 0;
  const width = options.screenWidthPx;

  const onScreen = candidates.filter((c) => c.anchorX >= 0 && c.anchorX <= width);
  const ordered = [...onScreen].sort(
    (a, b) => a.rank - b.rank || b.elevationM - a.elevationM || a.anchorX - b.anchorX,
  );

  const rows: PlacedLabel[][] = Array.from({ length: rowCount }, () => []);
  const placed: PlacedLabel[] = [];

  type Slot = { row: number; left: number; boxWidth: number };
  const overlapsIn = (row: PlacedLabel[], left: number, boxWidth: number) =>
    row.filter((p) => left < p.right + gapPx && left + boxWidth > p.left - gapPx).length;

  /** Free slot for a box of this width: natural position first, then (optionally) slid. */
  const findSlot = (anchorX: number, widthPx: number, slide: boolean): Slot | null => {
    const boxWidth = Math.min(widthPx, width - 2 * margin);
    const clampLeft = (l: number) => Math.min(Math.max(l, margin), width - margin - boxWidth);
    const natural = clampLeft(anchorX - boxWidth / 2);
    const tryAt = (left: number): Slot | null => {
      const row = rows.findIndex((r) => overlapsIn(r, left, boxWidth) === 0);
      return row === -1 ? null : { row, left, boxWidth };
    };
    const direct = tryAt(natural);
    if (direct || !slide) return direct;
    for (let shift = 4; shift <= maxShiftPx; shift += 4) {
      for (const dir of [1, -1]) {
        const slot = tryAt(clampLeft(natural + dir * shift));
        if (slot) return slot;
      }
    }
    return null;
  };

  for (const c of ordered) {
    if (placed.length >= maxLabels) break;
    const isMain = c.rank === 1;
    const naturalLeft = Math.min(
      Math.max(c.anchorX - Math.min(c.widthPx, width - 2 * margin) / 2, margin),
      width - margin - Math.min(c.widthPx, width - 2 * margin),
    );
    let compact = false;
    let forced = false;
    // 1) full label where it belongs; 2) rank 1: slide sideways; 3) rank 1: compact variant
    let slot = findSlot(c.anchorX, c.widthPx, isMain && maxShiftPx > 0);
    if (!slot && isMain && c.compactWidthPx !== undefined) {
      slot = findSlot(c.anchorX, c.compactWidthPx, maxShiftPx > 0);
      compact = slot !== null;
    }
    if (!slot) {
      if (!isMain) continue; // SPEC: overlaps in every row -> skip
      // Rank 1 always wins: least crowded row at its natural position, lowest row on ties.
      const boxWidth = Math.min(c.widthPx, width - 2 * margin);
      let row = 0;
      for (let r = 1; r < rowCount; r++) {
        if (
          overlapsIn(rows[r]!, naturalLeft, boxWidth) <
          overlapsIn(rows[row]!, naturalLeft, boxWidth)
        )
          row = r;
      }
      slot = { row, left: naturalLeft, boxWidth };
      forced = true;
    }
    const naturalForWidth = Math.min(
      Math.max(c.anchorX - slot.boxWidth / 2, margin),
      width - margin - slot.boxWidth,
    );
    const label: PlacedLabel = {
      id: c.id,
      row: slot.row,
      left: slot.left,
      right: slot.left + slot.boxWidth,
      anchorX: c.anchorX,
      forced,
      shiftPx: slot.left - naturalForWidth,
      compact,
    };
    rows[slot.row]!.push(label);
    placed.push(label);
  }
  return placed;
}
