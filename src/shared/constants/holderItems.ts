/**
 * Items a Bento compartment can hold in fitted pockets. A holder turns the
 * compartment's raised floor into a block of pockets, one per item, sunk the
 * full height of the raise.
 *
 * Sizes are the pocket, fit clearance included, so a pocket built to them
 * takes the item off the shelf. `w` runs along X and `d` along Y as listed;
 * the layout turns the footprint a quarter when that fits more. Ids are
 * stored in designs: never rename one, and mirror every addition in
 * `VALID_HOLDER_ITEMS` (api/lib/designerValidationConstants.ts).
 */

/**
 * - `rect` — a slot an item stands in (cards, plugs, coin cells).
 * - `round` — a round socket an item stands in (cylindrical batteries).
 * - `hex` — a hexagonal socket; `w` is the width across flats.
 * - `trough` — a round-bottomed channel an item lies in; `w` is its width and
 *   its length fills the compartment's longer side.
 */
export type HolderPocketShape = 'rect' | 'round' | 'hex' | 'trough';

export type HolderItemGroup = 'cards' | 'usb' | 'writing' | 'batteries' | 'other';

export const HOLDER_ITEM_IDS = [
  'sdCard',
  'microSdCard',
  'usbA',
  'usbC',
  'pen',
  'aa',
  'aaa',
  'c',
  'd',
  'li18650',
  'nineVolt',
  'cr2032',
  'hexBit',
  'm2Ssd',
] as const;

export type HolderItemId = (typeof HOLDER_ITEM_IDS)[number];

export interface HolderItem {
  readonly id: HolderItemId;
  readonly group: HolderItemGroup;
  readonly shape: HolderPocketShape;
  /** Pocket width (mm) along X; diameter, across flats or trough width. */
  readonly w: number;
  /** Pocket depth (mm) along Y; ignored for round, hex and trough pockets. */
  readonly d: number;
  /** Pocket depth (mm) a holder starts at: about a third to half the item. */
  readonly depthMm: number;
  /** Wall (mm) left between neighbouring pockets. */
  readonly gapMm: number;
}

const item = (
  id: HolderItemId,
  group: HolderItemGroup,
  shape: HolderPocketShape,
  w: number,
  d: number,
  depthMm: number,
  gapMm = 1.6
): HolderItem => ({ id, group, shape, w, d: shape === 'rect' ? d : w, depthMm, gapMm });

export const HOLDER_ITEMS: readonly HolderItem[] = [
  // SD 32 × 24 × 2.1, microSD 15 × 11 × 1: standing on the long edge.
  item('sdCard', 'cards', 'rect', 24.6, 2.8, 12),
  item('microSdCard', 'cards', 'rect', 11.6, 1.6, 7),
  // Plug only: USB-A 12 × 4.5, USB-C 8.3 × 2.6.
  item('usbA', 'usb', 'rect', 12.6, 5.1, 10),
  item('usbC', 'usb', 'rect', 9, 3.2, 6),
  // Pens and pencils up to about 11 mm across, lying down.
  item('pen', 'writing', 'trough', 12, 0, 6, 2),
  // Cylinder cells standing: AA 14.5, AAA 10.5, C 26.2, D 34.2, 18650 18.6.
  item('aa', 'batteries', 'round', 15, 0, 15),
  item('aaa', 'batteries', 'round', 11, 0, 12),
  item('c', 'batteries', 'round', 26.8, 0, 16),
  item('d', 'batteries', 'round', 34.8, 0, 18),
  item('li18650', 'batteries', 'round', 19.2, 0, 18),
  // 9V block 26.5 × 17.5, CR2032 coin cell standing in a slot.
  item('nineVolt', 'batteries', 'rect', 27.1, 18.1, 15),
  item('cr2032', 'batteries', 'rect', 20.6, 3.8, 8),
  // 1/4" hex driver bits and M.2 2280 drives on their short edge.
  item('hexBit', 'other', 'hex', 6.6, 0, 10),
  item('m2Ssd', 'other', 'rect', 22.8, 4, 15),
];

export const HOLDER_ITEM_GROUPS: readonly HolderItemGroup[] = [
  'cards',
  'usb',
  'writing',
  'batteries',
  'other',
];

export function holderItemById(id: unknown): HolderItem | undefined {
  return typeof id === 'string' ? HOLDER_ITEMS.find((entry) => entry.id === id) : undefined;
}
