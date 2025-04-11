import { create } from 'zustand';
import { temporal } from 'zundo';
import { devtools } from 'zustand-devtools';
import debounce from 'just-debounce-it';
import { Outline, SplineOutline, RoundedRectOutline, ViewBox, Point, ViewState, Bounds } from './types';
import { calculateMinimalGridArea } from './utils/grid';
import { getNextColor } from './utils/color';
import { calculateSplineBounds } from './utils/spline';

// Default values
const DEFAULT_ZOOM = 10;
const PADDING = 21; // 0.5 grid cells of padding

// Helper to calculate bounds for a rounded rectangle
const calculateRectBounds = (width: number, height: number): Bounds => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  return {
    minX: -halfWidth,
    minY: -halfHeight,
    maxX: halfWidth,
    maxY: halfHeight
  };
};

interface State {
  outlines: Outline[];
  viewState: ViewState;
  
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
  addRoundedRect: (width: number, height: number, radius: number, position?: Point) => void;
  updateOutline: (id: string, updates: Partial<Outline>) => void;
  selectOutline: (id: string | null, multiSelect?: boolean) => void;
  clearSelection: () => void;
  deleteOutline: (id: string) => void;
  updateMultipleOutlines: (updates: { id: string; updates: Partial<Outline> }[]) => void;
}

// Helper function to calculate viewBox from viewState
const calculateViewBox = (viewState: ViewState): ViewBox => {
  const { center, zoom } = viewState;
  
  // Use window dimensions instead of fixed constants for better responsiveness
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight - 64; // Subtract header height
  
  const width = viewWidth / zoom;
  const height = viewHeight / zoom;
  
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  };
};

export const useStore = create<State>()(
  devtools(
    temporal((set, get) => ({
      outlines: [],
      viewState: {
        center: { x: 21, y: 21 },
        zoom: DEFAULT_ZOOM
      },
      
      // Helper function to get viewBox
      getViewBox: () => calculateViewBox(get().viewState),
      
      setViewState: (viewState) => set(
        (state) => ({
          viewState: { ...state.viewState, ...viewState }
        }),
        false,
        'setViewState'
      ),
      
      zoomToPoint: (zoom, point) => set(
        (state) => {
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
        },
        false,
        'zoomToPoint'
      ),
      
      panView: (deltaX, deltaY) => set(
        (state) => ({
          viewState: {
            ...state.viewState,
            center: {
              x: state.viewState.center.x - deltaX / state.viewState.zoom,
              y: state.viewState.center.y - deltaY / state.viewState.zoom
            }
          }
        }),
        false,
        'panView'
      ),
      
      centerView: () => set(
        (state) => {
          const { min, max } = calculateMinimalGridArea(state.outlines);
          
          // Calculate the center point of the content
          const centerX = (min.x + max.x) / 2;
          const centerY = (min.y + max.y) / 2;
          
          // Calculate required zoom to fit the content with padding
          const contentWidth = max.x - min.x + PADDING;
          const contentHeight = max.y - min.y + PADDING;
          
          // Use actual window dimensions instead of fixed BASE_VIEW values
          const viewWidth = window.innerWidth;
          const viewHeight = window.innerHeight - 64; // Subtract header height
          
          // Calculate zoom based on both dimensions and take the smaller one to ensure everything fits
          const zoomX = viewWidth / contentWidth;
          const zoomY = viewHeight / contentHeight;
          const zoom = Math.min(zoomX, zoomY);
          
          return {
            viewState: {
              center: { x: centerX, y: centerY },
              zoom: zoom
            }
          };
        },
        false,
        'centerView'
      ),

      addOutline: (points, bitmap, position = {x: 0, y: 0}) => set(
        (state) => {
          const newState = {
            outlines: [...state.outlines, {
              id: Math.random().toString(36).substr(2, 9),
              type: 'spline',
              points: points[0], // Take first contour for now
              position: position,
              rotation: 0,
              selected: false,
              editMode: false,
              color: getNextColor(state.outlines.length),
              bounds: calculateSplineBounds(points[0]),
              bitmap
            } as SplineOutline]
          };
          return newState;
        },
        false,
        'addOutline'
      ),
      
      addRoundedRect: (width, height, radius, position = {x: 0, y: 0}) => set(
        (state) => {
          const newState = {
            outlines: [...state.outlines, {
              id: Math.random().toString(36).substr(2, 9),
              type: 'roundedRect',
              width,
              height,
              radius,
              position,
              rotation: 0,
              selected: false,
              editMode: false,
              color: getNextColor(state.outlines.length),
              bounds: calculateRectBounds(width, height)
            } as RoundedRectOutline]
          };
          return newState;
        },
        false,
        'addRoundedRect'
      ),

      updateOutline: (id, updates) => set(
        (state) => ({
          outlines: state.outlines.map(outline => {
            if (outline.id !== id) return outline;
            
            if (outline.type === 'spline') {
              // Handle spline outline updates
              const splineUpdates = updates as Partial<SplineOutline>;
              const updatedOutline = { ...outline, ...splineUpdates };
              
              // Recalculate bounds if points changed
              if (splineUpdates.points) {
                updatedOutline.bounds = calculateSplineBounds(updatedOutline.points);
              }
              
              return updatedOutline;
            } else {
              // Handle rounded rect outline updates
              const rectOutline = outline as RoundedRectOutline;
              const rectUpdates = updates as Partial<RoundedRectOutline>;
              const updatedOutline = { ...rectOutline, ...rectUpdates };
              
              // Recalculate bounds if dimensions changed
              if (rectUpdates.width !== undefined || rectUpdates.height !== undefined) {
                const width = rectUpdates.width ?? updatedOutline.width;
                const height = rectUpdates.height ?? updatedOutline.height;
                updatedOutline.bounds = calculateRectBounds(width, height);
              }
              
              return updatedOutline;
            }
          })
        }),
        false,
        'updateOutline'
      ),

      updateMultipleOutlines: (updates) => set(
        (state) => ({
          outlines: state.outlines.map(outline => {
            const update = updates.find(u => u.id === outline.id);
            if (!update) return outline;
            
            // Type-safe updates based on outline type
            if (outline.type === 'spline') {
              const splineOutline = outline as SplineOutline;
              const splineUpdates = update.updates as Partial<SplineOutline>;
              const updatedOutline = { ...splineOutline, ...splineUpdates };
              
              // Recalculate bounds if points changed
              if (splineUpdates.points) {
                updatedOutline.bounds = calculateSplineBounds(updatedOutline.points);
              }
              
              return updatedOutline;
            } else {
              const rectOutline = outline as RoundedRectOutline;
              const rectUpdates = update.updates as Partial<RoundedRectOutline>;
              const updatedOutline = { ...rectOutline, ...rectUpdates };
              
              // Recalculate bounds if dimensions changed
              if (rectUpdates.width !== undefined || rectUpdates.height !== undefined) {
                const width = rectUpdates.width ?? updatedOutline.width;
                const height = rectUpdates.height ?? updatedOutline.height;
                updatedOutline.bounds = calculateRectBounds(width, height);
              }
              
              return updatedOutline;
            }
          })
        }),
        false,
        'updateMultipleOutlines'
      ),

      selectOutline: (id, multiSelect = false) => set(
        (state) => ({
          outlines: state.outlines.map(outline => ({
            ...outline,
            selected: multiSelect ? 
              (outline.id === id ? !outline.selected : outline.selected) : // Toggle on shift-click
              outline.id === id, // Normal click behavior
            editMode: outline.id === id ? outline.editMode : false
          }))
        }),
        false,
        'selectOutline'
      ),
      
      clearSelection: () => set(
        (state) => ({
          outlines: state.outlines.map(outline => ({
            ...outline,
            selected: false,
            editMode: false
          }))
        }),
        false,
        'clearSelection'
      ),
      
      deleteOutline: (id) => set(
        (state) => ({
          outlines: state.outlines.filter(outline => outline.id !== id)
        }),
        false,
        'deleteOutline'
      )
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
  )
);