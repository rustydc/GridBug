import { useQuery, useMutation } from '@tanstack/react-query';
import { useSamWorker } from './samWorkerSingleton';
import type { DataPoint, MaskResult } from './samWorkerApi';

/**
 * Hook to initialize the SAM worker
 */
export function useInitializeSam() {
  const { proxy: samWorker } = useSamWorker();
  
  return useQuery({
    queryKey: ['sam', 'initialize'],
    queryFn: async () => {
      console.log("Initializing SAM...");
      await samWorker.initialize();
      console.log("Sam initialized.")
      return true;
    },
    // Only run once, no need to refetch
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Hook to check if the SAM worker is ready
 */
export function useSamReady() {
  const { proxy: samWorker } = useSamWorker();
  
  return useQuery({
    queryKey: ['sam', 'ready'],
    queryFn: () => samWorker.isReady(),
    // Poll occasionally to check readiness
    refetchInterval: 1000,
    staleTime: 0,
  });
}

/**
 * Hook to process an image with the SAM worker
 * This is the key hook that deduplicates image processing requests
 */
export function useProcessImage(imageUrl: string | null) {
  const { proxy: samWorker } = useSamWorker();
  
  return useQuery({
    queryKey: ['sam', 'processImage', imageUrl],
    queryFn: async () => {
      if (!imageUrl) throw new Error('No image URL provided');
      await samWorker.processImage(imageUrl);
      return true;
    },
    // Don't run the query if no image URL is provided
    enabled: !!imageUrl,
    // Image processing results don't go stale
    staleTime: Infinity,
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to generate a mask from points
 */
export function useGenerateMask() {
  const { proxy: samWorker } = useSamWorker();
  
  return useMutation<MaskResult, Error, DataPoint[]>({
    mutationFn: async (points: DataPoint[]): Promise<MaskResult> => {
      return await samWorker.generateMask(points);
    },
  });
}

/**
 * Hook to reset the SAM worker
 */
export function useResetSam() {
  const { proxy: samWorker } = useSamWorker();
  
  return useMutation<boolean, Error, void>({
    mutationFn: async () => {
      await samWorker.reset();
      return true;
    },
  });
}