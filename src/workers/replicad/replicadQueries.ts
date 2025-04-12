import { useQuery } from '@tanstack/react-query';
import { createComlinkSingleton } from 'react-use-comlink';
import type { ReplicadWorkerAPI, ReplicadFaces, ReplicadEdges } from './replicadWorkerApi';
import { ObjectData } from '../../types';

// Export the types to be used by components
export type { ReplicadFaces, ReplicadEdges };

/**
 * Create a hash for an outline to capture all its properties that affect the model
 */
function hashOutline(outline: ObjectData): string {
  // Using type exhaustiveness to ensure we handle all possible types
  switch (outline.type) {
    case 'roundedRect':
      return `rect:${outline.id}:${outline.width}:${outline.height}:${outline.radius}:${outline.position.x}:${outline.position.y}:${outline.rotation}`;
    case 'spline': {
      // Create a hash of all points in the spline
      const pointsHash = outline.points.map(p => `${p.x},${p.y}`).join(';');
      return `spline:${outline.id}:${outline.position.x}:${outline.position.y}:${outline.rotation}:${pointsHash}`;
    }
  }
}

/**
 * Create a cache key that captures all relevant properties of an outline collection
 */
function createOutlinesKey(outlines: ObjectData[]): string[] {
  return outlines.map(hashOutline);
}

// Create a worker instance first
const worker = new Worker(new URL('./replicadWorker.ts', import.meta.url), {type: 'module'});

/**
 * Create a singleton worker with Comlink
 * This ensures one worker instance is shared across components
 */
export const useReplicadWorker = createComlinkSingleton<ReplicadWorkerAPI>(worker);

/**
 * Hook to initialize the Replicad worker
 */
export function useInitializeReplicad() {
  const { proxy: replicadWorker } = useReplicadWorker();
  
  return useQuery({
    queryKey: ['replicad', 'initialize'],
    queryFn: async () => {
      console.log("Initializing Replicad...");
      await replicadWorker.initialize();
      console.log("Replicad initialized.");
      return true;
    },
    // Only run once, no need to refetch
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Hook to check if the Replicad worker is ready
 */
export function useReplicadReady() {
  const { proxy: replicadWorker } = useReplicadWorker();
  
  return useQuery({
    queryKey: ['replicad', 'ready'],
    queryFn: () => replicadWorker.isReady(),
    refetchInterval: 1000, // Poll occasionally to check readiness
    staleTime: 0,
  });
}

/**
 * Hook to generate a 3D model with the Replicad worker
 * This is a query-based approach with proper caching based on inputs
 */
export function useGenerateModel(
  outlines: ObjectData[],
  totalHeight: number,
  baseHeight: number = 4.75,
  enabled: boolean = true
) {
  const { proxy: replicadWorker } = useReplicadWorker();
  
  // Create a query key that captures all model properties, not just IDs
  const outlineKeys = createOutlinesKey(outlines);
  
  return useQuery({
    queryKey: ['replicad', 'model', totalHeight, baseHeight, outlines.length, outlineKeys],
    queryFn: async () => {
      // Only generate model if there are outlines
      if (outlines.length === 0) {
        return null;
      }
      
      return await replicadWorker.generateModel(
        outlines,
        totalHeight,
        baseHeight
      );
    },
    // Don't automatically refetch on window focus
    refetchOnWindowFocus: false,
    // Results don't go stale unless inputs change
    staleTime: Infinity,
    // Enable the query only when there are outlines and when explicitly enabled
    enabled: outlines.length > 0 && enabled,
  });
}

/**
 * Hook to get the STEP export data for a model
 * This is a query-based approach with proper caching based on inputs
 */
export function useStepExport(
  outlines: ObjectData[],
  totalHeight: number,
  baseHeight: number = 4.75,
  enabled: boolean = false
) {
  const { proxy: replicadWorker } = useReplicadWorker();
  
  // Create a query key that captures all model properties, not just IDs
  const outlineKeys = createOutlinesKey(outlines);
  
  return useQuery({
    queryKey: ['replicad', 'step', totalHeight, baseHeight, outlines.length, outlineKeys],
    queryFn: async () => {
      // Only generate STEP if there are outlines
      if (outlines.length === 0) {
        return null;
      }
      
      return await replicadWorker.exportSTEP(
        outlines,
        totalHeight,
        baseHeight
      );
    },
    // Don't automatically refetch on window focus
    refetchOnWindowFocus: false,
    // Results don't go stale unless inputs change
    staleTime: Infinity,
    // Only run query when explicitly enabled and there are outlines
    enabled: enabled && outlines.length > 0,
  });
}