/**
 * Bin Designer feature module — public API.
 *
 * Only symbols that external consumers (design-linking, App.tsx, shared/)
 * actually need are exported here. Internal implementation details stay
 * behind sub-barrel boundaries.
 *
 * If you need to add a new export, verify that the consumer cannot import
 * from @/shared/types/bin or @/shared/constants/bin instead.
 */

export type { BinParams, SavedDesign } from './types';
export type { CustomBinRef } from './store';

// --- Store ---
export {
  useDesignerStore,
  removeRegistryEntry,
  upsertRegistryEntry,
  registryEdgeFields,
  registryHeightFields,
  registryOverhangFields,
  registrySplitFields,
  registrySlantFields,
  loadRegistry,
  subscribeToRegistry,
} from './store';

// --- Storage ---
// `saveDesign` is exposed for design-linking's layout→single-bin merge, which
// must persist a full BinParams (compartment cells, texts) before navigating.
// The `createFrom=bin` query-string handoff cannot carry that payload.
export { loadDesign, deleteDesign, listDesigns, updateDesignParams, saveDesign } from './storage';
export { ensureSlantRowDesign } from './utils/slantRowDesign';

// Concrete DesignStorePort. Exposed for `shared/storage/` to register with the
// core-owned port so core/storage can persist/read designs without a
// cross-boundary import (parallels `designAdapter` for sync below).
export { designStoreAdapter } from './storage/designStoreAdapter';

// --- Hooks ---
// Deep paths on purpose: the ./hooks barrel also re-exports useAutoSave /
// useThumbnailCapture, which import ./utils/thumbnail (full three.js namespace).
// This module is eagerly imported by App and the sync flows, so going through the
// barrel would pull three core onto first paint.
export { useBackgroundThumbnailRegen } from './hooks/useBackgroundThumbnailRegen';
export { useMeshFileMaintenance } from './hooks/useMeshFileMaintenance';
export { useCustomBins } from './hooks/useCustomBins';
export {
  useDesignThumbnail,
  clearThumbnailCache,
  updateThumbnailCache,
} from './hooks/useDesignThumbnail';
export { useBinDefaults } from './hooks/useBinDefaults';
export type { UseBinDefaults } from './hooks/useBinDefaults';

// --- Utils ---
// Deep path on purpose: the ./utils barrel re-exports ./thumbnail, which imports
// the full three.js namespace for offscreen rendering. Pulling the barrel here
// would drag three core onto first paint (this module is eagerly imported by App
// and the sync flows). fileNaming and compartments are three-free.
export { generateFileName } from './utils/fileNaming';
export { designFootprint, isBinDesign, isLayoutPlaceableDesign } from './utils/designKind';
// Exposed for the layout 3D preview (shared/hooks/useLinkedDesignDividers) to
// derive compartment divider walls for bins linked to saved designs.
export { deriveWallSegments } from './utils/compartments';
// Exposed for design-linking's layout→single-bin merge, which builds a
// CompartmentConfig from a set of layout bins and must keep the parallel
// `compartmentTexts` in lockstep with the renumbered cells.
export { normalizeIdsWithRemap, remapCompartmentTexts } from './utils/compartments';
export { validateBinParams } from './utils/validation';
// Exposed for shared/hooks/useLabelPlateCounts (print-list plate counts) to
// feed the same innerW into planLabelPlates that the worker uses.
export { binDimensions, cutoutInterior } from './utils/binDimensions';
// Exposed for design-linking's layout inspector, which shows a linked bin's
// inside size without loading the designer.
export { binInteriorDimensions } from './utils/interiorDimensions';
export type { InteriorDimensions } from './utils/interiorDimensions';
// Exposed for the layout inspector (inside size of an unlinked bin) and the
// layout's Fit contents tool, which measure a bin that exists only as a
// rectangle. Both go through the same BinParams the designer generates from.
export { plainBinInterior, plainBinParams } from './utils/plainBin';
export type { PlainBinInput, PlainBinSize } from './utils/plainBin';
// Exposed for the layout's Fit contents tool in the Tools panel.
export { fitContents } from './utils/fitContents';
export type { ContentsFit, ContentsFitResult, ContentsSize } from './utils/fitContents';
export { formatCompactMm } from './utils/compartmentDimensions';

// Exposed for `shared/sync/` to wire into the sync engine without reaching
// into the feature's internal path.
export { designAdapter } from './sync/designAdapter';

// --- Components ---
// Intentionally NOT re-exported here. DesignerPage/ExampleGallery pull in the
// full three.js + drei + troika 3D stack. This barrel is statically imported by
// many eager modules (sync flows, design-linking hooks, SettingsModal) for its
// hooks/types/adapter; re-exporting the 3D components dragged that ~360 kB gzip
// chunk onto first paint. Consumers must deep-import them via their own paths so
// they stay behind lazy boundaries.

// --- Help modal integration ---
export { helpEntries } from './helpEntries';
