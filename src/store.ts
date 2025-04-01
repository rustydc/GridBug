import { create } from 'zustand';
import { temporal } from 'zundo';
import debounce from 'just-debounce-it';
import { Outline, ViewBox, Point, ViewState } from './types';
import { calculateMinimalGridArea } from './utils/grid';
import { getNextColor } from './utils/color';
import { calculateSplineBounds } from './utils/spline';

// Default values
const DEFAULT_ZOOM = 1;
const BASE_VIEW_WIDTH = 800;
const BASE_VIEW_HEIGHT = 600;
const PADDING = 84; // 2 grid cells of padding

interface State {
  outlines: Outline[];
  viewState: ViewState;
  segmentationWorker: Worker | null;
  workerReady: boolean;
  
  // View state management
  setViewState: (viewState: Partial<ViewState>) => void;
  zoomToPoint: (zoom: number, point: Point) => void;
  centerView: () => void;
  panView: (deltaX: number, deltaY: number) => void;
  
  // Calculated view box (derived from viewState)
  getViewBox: () => ViewBox;
  
  // Outline management
  addOutline: (points: Point[][], bitmap?: {
    url: string;
    width: number;
    height: number;
    position: Point;
  }, position?: Point) => void;
  updateOutline: (id: string, updates: Partial<Outline>) => void;
  selectOutline: (id: string | null, multiSelect?: boolean) => void;
  clearSelection: () => void;
  deleteOutline: (id: string) => void;
  updateMultipleOutlines: (updates: { id: string; updates: Partial<Outline> }[]) => void;
  
  // Worker management
  initializeWorker: () => Promise<Worker>;
  setWorkerReady: (ready: boolean) => void;
}

// Helper function to calculate viewBox from viewState
const calculateViewBox = (viewState: ViewState): ViewBox => {
  const { center, zoom } = viewState;
  const width = BASE_VIEW_WIDTH / zoom;
  const height = BASE_VIEW_HEIGHT / zoom;
  
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  };
};

export const useStore = create<State>()(
  temporal((set, get) => ({
    outlines: [],
    viewState: {
      center: { x: 0, y: 0 },
      zoom: DEFAULT_ZOOM
    },
    segmentationWorker: null,
    workerReady: false,
    
    // Helper function to get viewBox
    getViewBox: () => calculateViewBox(get().viewState),
    
    setViewState: (viewState) => set((state) => ({
      viewState: { ...state.viewState, ...viewState }
    })),
    
    zoomToPoint: (zoom, point) => set((state) => {
      // Calculate how the center should shift to keep the target point stationary
      const currentZoom = state.viewState.zoom;
      const zoomRatio = currentZoom / zoom;
      
      const currentCenter = state.viewState.center;
      
      // The distance from center to point will change by the inverse of the zoom ratio
      const dx = (point.x - currentCenter.x) * (1 - zoomRatio);
      const dy = (point.y - currentCenter.y) * (1 - zoomRatio);
      
      // New center is shifted by this delta
      return {
        viewState: {
          center: {
            x: currentCenter.x + dx,
            y: currentCenter.y + dy
          },
          zoom
        }
      };
    }),
    
    panView: (deltaX, deltaY) => set((state) => ({
      viewState: {
        ...state.viewState,
        center: {
          x: state.viewState.center.x - deltaX / state.viewState.zoom,
          y: state.viewState.center.y - deltaY / state.viewState.zoom
        }
      }
    })),
    
    centerView: () => set((state) => {
      const { min, max } = calculateMinimalGridArea(state.outlines);
      
      // Calculate the center point of the content
      const centerX = (min.x + max.x) / 2;
      const centerY = (min.y + max.y) / 2;
      
      // Calculate required zoom to fit the content with padding
      const contentWidth = max.x - min.x + PADDING * 2;
      const contentHeight = max.y - min.y + PADDING * 2;
      
      // Calculate zoom based on both dimensions and take the smaller one to ensure everything fits
      const zoomX = BASE_VIEW_WIDTH / contentWidth;
      const zoomY = BASE_VIEW_HEIGHT / contentHeight;
      const zoom = Math.min(zoomX, zoomY);
      
      return {
        viewState: {
          center: { x: centerX, y: centerY },
          zoom: zoom
        }
      };
    }),

    addOutline: (points, bitmap, position = {x: 0, y: 0}) => set((state) => {
      const newState = {
        outlines: [...state.outlines, {
          id: Math.random().toString(36).substr(2, 9),
          points: points[0], // Take first contour for now
          position: position,
          rotation: 0,
          selected: false,
          editMode: false,
          color: getNextColor(state.outlines.length),
          bounds: calculateSplineBounds(points[0]),
          bitmap
        }]
      };
      get().centerView();
      return newState;
    }),

    updateOutline: (id, updates) => set((state) => ({
      outlines: state.outlines.map(outline => 
        outline.id === id ? { 
          ...outline, 
          ...updates,
          // Recalculate bounds if points changed
          bounds: updates.points ? calculateSplineBounds(updates.points) : outline.bounds
        } : outline
      )
    })),

    updateMultipleOutlines: (updates) => set((state) => ({
      outlines: state.outlines.map(outline => {
        const update = updates.find(u => u.id === outline.id);
        return update ? { ...outline, ...update.updates } : outline;
      })
    })),

    selectOutline: (id, multiSelect = false) => set((state) => ({
      outlines: state.outlines.map(outline => ({
        ...outline,
        selected: multiSelect ? 
          (outline.id === id ? !outline.selected : outline.selected) : // Toggle on shift-click
          outline.id === id, // Normal click behavior
        editMode: outline.id === id ? outline.editMode : false
      }))
    })),
    
    clearSelection: () => set((state) => ({
      outlines: state.outlines.map(outline => ({
        ...outline,
        selected: false,
        editMode: false
      }))
    })),
    
    deleteOutline: (id) => set((state) => ({
      outlines: state.outlines.filter(outline => outline.id !== id)
    })),
    
    initializeWorker: async () => {
      const state = get();
      
      // Return existing worker if already initialized and ready
      if (state.segmentationWorker && state.workerReady) {
        return state.segmentationWorker;
      }
      
      // Return existing worker if it's still initializing
      if (state.segmentationWorker) {
        console.log('Worker already initializing');
        return state.segmentationWorker;
      }
      
      // Create and store the worker first to prevent double initialization
      const worker = new Worker(new URL('./utils/worker.ts', import.meta.url), { type: 'module' });
      set({ segmentationWorker: worker });
      
      // Set up message handler
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          console.log('Worker initialized and ready');
          set({ workerReady: true });
        } else if (e.data.type === 'error') {
          console.error('Worker initialization error:', e.data.error);
        }
      };
      
      return worker;
    },
    
    setWorkerReady: (ready) => set({ workerReady: ready })
  }), {
    limit: 50,
    partialize: (state) => ({
      outlines: state.outlines,
      viewState: state.viewState
    }),
    handleSet: (handleSet) => {
      const debouncedSet = debounce(handleSet, 3000, true);
      return (state) => debouncedSet(state);
    }
  })
);
