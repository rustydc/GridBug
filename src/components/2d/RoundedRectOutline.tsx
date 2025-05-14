import React, { useRef } from 'react';
import { RoundedRectOutline as RoundedRectOutlineType } from '../../types';
import { useStore } from '../../store';
import { untransformPoint } from '../../utils/geometry';
import TransformHandles from './TransformHandles';

const RoundedRectOutline: React.FC<RoundedRectOutlineType> = ({ 
  id, bounds, width, height, radius, position, rotation, selected, editMode, color 
}) => {
  const dragRef = useRef<{ startX: number; startY: number; handleType?: 'move' | 'resize' | 'radius' }>({ startX: 0, startY: 0 });
  const { updateOutline, selectOutline, updateMultipleOutlines, outlines, viewState } = useStore();
  const svgRef = useRef<SVGElement | null>(null);
  const zoomFactor = viewState.zoom;

  // Base handle sizes in user coordinates - will be adjusted for zoom
  const handleBaseSize = 6;
  const strokeBaseWidth = 1; // Base stroke width for the path

  // Adjust size inversely with zoom to maintain visual size
  const handleSize = handleBaseSize / Math.max(0.1, zoomFactor);
  const strokeWidth = strokeBaseWidth / Math.max(0.1, zoomFactor);

  // Calculate corner points in local space
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  const handleDoubleClick = () => {
    updateOutline(id, { editMode: !editMode });
  };

  // Track if we're dragging to prevent click after drag
  const isDragging = useRef(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Only handle click if we're not at the end of a drag operation
    if (!isDragging.current) {
      selectOutline(id, e.shiftKey);
    }
    // Reset drag state
    isDragging.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent, handleType: 'move' | 'resize' | 'radius' = 'move') => {
    e.stopPropagation();
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    
    svgRef.current = svg;  // Store SVG reference
    
    // Update selection on mousedown
    if (handleType === 'move' && !editMode) {
      selectOutline(id, e.shiftKey);
    }
    
    // Reset dragging state on mousedown
    isDragging.current = false;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // If we're handling resize or radius, we need local coordinates
    if (handleType === 'resize' || handleType === 'radius') {
      const localPoint = untransformPoint(svgP, position, rotation);
      dragRef.current = { 
        startX: localPoint.x,
        startY: localPoint.y,
        handleType
      };
    } else {
      dragRef.current = { 
        startX: svgP.x - position.x,
        startY: svgP.y - position.y,
        handleType
      };
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgElement = svg as SVGSVGElement;
    const pt = svgElement.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgElement.getScreenCTM()?.inverse());
    
    // Set dragging to true as soon as we move
    isDragging.current = true;

    if (dragRef.current.handleType === 'resize') {
      // Transform the SVG point to the outline's local coordinate system
      const localPoint = untransformPoint(svgP, position, rotation);
      
      // Calculate new width and height based on local point position
      // We're using absolute values to prevent negative dimensions
      const newWidth = Math.max(1, Math.abs(localPoint.x) * 2);
      const newHeight = Math.max(1, Math.abs(localPoint.y) * 2);
      
      // Radius cannot be larger than half the smallest dimension
      const maxRadius = Math.min(newWidth, newHeight) / 2;
      const adjustedRadius = Math.min(radius, maxRadius);
      
      updateOutline(id, { 
        width: newWidth, 
        height: newHeight,
        radius: adjustedRadius 
      });
    } else if (dragRef.current.handleType === 'radius') {
      // Transform the SVG point to the outline's local coordinate system
      const localPoint = untransformPoint(svgP, position, rotation);
      
      // Calculate distance from top-left corner along x-axis
      // We only care about horizontal distance for a cleaner UX
      const cornerX = -halfWidth;
      const dx = localPoint.x - cornerX;
      
      // Calculate new radius based on horizontal distance from corner
      // Clamped to minimum of 0 and maximum of half the smallest dimension
      const newRadius = Math.max(0, Math.min(Math.min(width, height) / 2, dx));
      
      updateOutline(id, { radius: newRadius });
    } else {
      // Handle moving the shape
      const deltaX = svgP.x - dragRef.current.startX - position.x;
      const deltaY = svgP.y - dragRef.current.startY - position.y;
      
      // If this outline is selected, move all selected outlines
      if (selected) {
        const selectedOutlines = outlines.filter(o => o.selected);
        if (selectedOutlines.length > 1) {
          const updates = selectedOutlines.map(outline => ({
            id: outline.id,
            updates: { 
              position: {
                x: outline.position.x + deltaX,
                y: outline.position.y + deltaY
              }
            }
          }));
          updateMultipleOutlines(updates);
        } else {
          updateOutline(id, { position: { x: position.x + deltaX, y: position.y + deltaY } });
        }
      } else {
        updateOutline(id, { position: { x: position.x + deltaX, y: position.y + deltaY } });
      }
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // No longer need handleRotateRequest as TransformHandles handles rotation directly

  return (
    <>
      {/* Apply transform to position and rotate the rectangle */}
      <g transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}>
        {/* Rounded rectangle */}
        <rect
          x={-halfWidth}
          y={-halfHeight}
          width={width}
          height={height}
          rx={radius}
          ry={radius}
          fill={color}
          fillOpacity={0.2}
          stroke={selected ? "#2196f3" : color}
          strokeWidth={strokeWidth}
          onDoubleClick={handleDoubleClick}
          onClick={handleClick}
          onMouseDown={(e) => handleMouseDown(e, 'move')}
          data-outline-id={id}
        />
        
        {/* Edit handles when in edit mode */}
        {editMode && (
          <>
            {/* Radius handle - positioned at the top-left edge */}
            <circle
              cx={-halfWidth + radius}
              cy={-halfHeight}
              r={handleSize}
              fill="#ff9800"
              cursor="pointer"
              onMouseDown={(e) => handleMouseDown(e, 'radius')}
            />
            
            {/* Visual indicator for radius */}
            <path
              d={`M ${-halfWidth} ${-halfHeight + radius} 
                  A ${radius} ${radius} 0 0 0 ${-halfWidth + radius} ${-halfHeight}`}
              stroke="#ff9800"
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeWidth * 4},${strokeWidth * 2}`}
              fill="none"
            />
          </>
        )}

        {/* Keep transform handles in local space */}
        {selected && !editMode && (
          <TransformHandles
            bounds={bounds}
            position={position}
            rotation={rotation}
            outlineId={id}
            type="roundedRect"
          />
        )}
      </g>
    </>
  );
};

export default RoundedRectOutline;