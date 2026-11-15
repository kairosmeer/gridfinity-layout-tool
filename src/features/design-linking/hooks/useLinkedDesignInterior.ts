/**
 * Inside size of a bin's linked design, for the layout inspector.
 *
 * The registry ref carries only the outer width/depth/height, so the inside
 * size needs the full saved params. They are read from IndexedDB on demand and
 * cached against `designId@updatedAt`: a re-saved design gets a new stamp and
 * therefore a fresh read, while a burst of inspector renders shares one load.
 *
 * The reading carries the design's own size as well as its cavity. A placed bin
 * keeps its own dimensions and can be resized away from its design (that is
 * what the sync prompt is for), so the caller has to be able to tell whether
 * the numbers still describe the bin on screen.
 *
 * Returns null for an unlinked bin, an assembly or imported mesh (no `params`),
 * a deleted design, and every design `binInteriorDimensions` itself refuses to
 * measure.
 */

import { useEffect, useState } from 'react';
import type { DesignId } from '@/core/types';
import { isOk } from '@/core/result';
import {
  binInteriorDimensions,
  loadDesign,
  type InteriorDimensions,
} from '@/features/bin-designer';
import { useLinkedDesign } from './useLinkedDesign';

export interface LinkedDesignInteriorReading {
  /** The cavity `params` describe. */
  readonly interior: InteriorDimensions;
  /** The design's own size in grid and height units. */
  readonly design: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
}

const interiorCache = new Map<string, LinkedDesignInteriorReading | null>();
const pendingLoads = new Map<string, Promise<LinkedDesignInteriorReading | null>>();

function cacheKey(id: DesignId, updatedAt: string): string {
  return `${id}@${updatedAt}`;
}

function loadInterior(key: string, id: DesignId): Promise<LinkedDesignInteriorReading | null> {
  if (interiorCache.has(key)) return Promise.resolve(interiorCache.get(key) ?? null);

  const inFlight = pendingLoads.get(key);
  if (inFlight) return inFlight;

  const load = (async () => {
    try {
      const result = await loadDesign(id);
      const params = isOk(result) ? result.value.params : undefined;
      const interior = params ? binInteriorDimensions(params) : null;
      if (!params || !interior) {
        interiorCache.set(key, null);
        return null;
      }
      const reading: LinkedDesignInteriorReading = {
        interior,
        design: { width: params.width, depth: params.depth, height: params.height },
      };
      interiorCache.set(key, reading);
      return reading;
    } catch {
      // A thrown read is transient (storage unavailable), so it is not cached;
      // the next mount tries again instead of showing a permanent blank.
      return null;
    } finally {
      pendingLoads.delete(key);
    }
  })();

  pendingLoads.set(key, load);
  return load;
}

/** Drop every cached reading. Exposed for tests and for a full registry reset. */
export function clearLinkedDesignInteriorCache(): void {
  interiorCache.clear();
  pendingLoads.clear();
}

export function useLinkedDesignInterior(
  linkedDesignId: DesignId | undefined
): LinkedDesignInteriorReading | null {
  const { linkedDesign } = useLinkedDesign(linkedDesignId);

  const key = linkedDesign ? cacheKey(linkedDesign.id, linkedDesign.updatedAt) : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    reading: LinkedDesignInteriorReading | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !linkedDesign) return;
    let active = true;
    void loadInterior(key, linkedDesign.id).then((reading) => {
      if (active) setLoaded({ key, reading });
    });
    return () => {
      active = false;
    };
  }, [key, linkedDesign]);

  // The key check keeps the previous design's size off the screen while the
  // next one loads; an unlinked or unloadable bin simply shows nothing.
  if (key === null || loaded === null || loaded.key !== key) return null;
  return loaded.reading;
}
