import { createComlinkSingleton } from 'react-use-comlink';
import type { SAMWorkerAPI } from './samWorkerApi';

// Create a worker instance first
const worker = new Worker(new URL('./samWorker.ts', import.meta.url), { type: 'module' });

/**
 * Create a singleton worker with Comlink
 * This ensures one worker instance is shared across components
 */
export const useSamWorker = createComlinkSingleton<SAMWorkerAPI>(worker);