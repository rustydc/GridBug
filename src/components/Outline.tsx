import React, { useRef } from 'react';
import { Outline as OutlineType, Point } from '../types';
import { useStore } from '../store';
import { generateSplinePath, findClosestPointOnCurve } from '../utils/spline';
import TransformHandles from './TransformHandles';

interface OutlineProps extends OutlineType {
  onRotateRequest?: (outlineId: string) => void;
}

const Outline: React.FC<OutlineProps> = ({ 
  id, bounds, points, position, rotation, selected, editMode, color, bitmap, onRotateRequest 
}) => {
  const dragRef = useRef<{ startX: number; startY: number; pointIndex?: number }>({ startX: 0, startY: 0 });
  const { updateOutline, selectOutline, updateMultipleOutlines, outlines, zoomFactor } = useStore();
  const svgRef = useRef<SVGElement | null>(null);

  // Calculate center of bounds for rotation
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  
  // Rotate around shape's origin, not center
  const transformString = `translate(${position.x}, ${position.y}) rotate(${rotation})`;
  const pathD = generateSplinePath(points);
  
  // Base handle sizes in user coordinates - will be adjusted for zoom
  const handleBaseSize = 6; // Increased from 4 to 6 for larger control points
  const deleteHandleBaseSize = 1.5;
  const deleteHandleOffset = 6;
  const strokeBaseWidth = 1; // Base stroke width for the path

  // Adjust size inversely with zoom to maintain visual size
  const handleSize = handleBaseSize / Math.max(0.1, zoomFactor);
  const deleteHandleSize = deleteHandleBaseSize / Math.max(0.1, zoomFactor);
  const strokeWidth = strokeBaseWidth / Math.max(0.1, zoomFactor);

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

  const handleDragPoint = (index: number, newPos: Point) => {
    const newPoints = [...points];
    newPoints[index] = newPos;
    updateOutline(id, { points: newPoints });
  };

  const handleMouseDown = (e: React.MouseEvent, pointIndex?: number) => {
    e.stopPropagation();
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    
    svgRef.current = svg;  // Store SVG reference
    
    // Update selection on mousedown (not just on click)
    // Only if we're dragging the whole shape (not a control point)
    if (pointIndex === undefined && !editMode) {
      selectOutline(id, e.shiftKey);
    }
    
    // Reset dragging state on mousedown
    isDragging.current = false;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    dragRef.current = { 
      startX: svgP.x - (pointIndex !== undefined ? points[pointIndex].x : position.x),
      startY: svgP.y - (pointIndex !== undefined ? points[pointIndex].y : position.y),
      pointIndex
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const svg = svgRef.current;  // Use stored reference instead
    if (!svg) return;

    const svgElement = svg as SVGSVGElement;
    const pt = svgElement.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgElement.getScreenCTM()?.inverse());

    if (dragRef.current.pointIndex !== undefined) {
      const newPoints = [...points];
      newPoints[dragRef.current.pointIndex] = {
        x: svgP.x - dragRef.current.startX,
        y: svgP.y - dragRef.current.startY
      };
      updateOutline(id, { points: newPoints });
    } else {
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

  const handleRotateRequest = () => {
    if (onRotateRequest) {
      onRotateRequest(id);
    }
  };

  const handlePointDelete = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (points.length > 3) { // Maintain at least 3 points for a valid shape
      const newPoints = points.filter((_, i) => i !== index);
      updateOutline(id, { points: newPoints });
    }
  };

  const handlePathClick = (e: React.MouseEvent) => {
    if (!editMode) {
      handleClick(e);
      return;
    }

    e.stopPropagation();
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // Transform click point to local space
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const localX = (svgP.x - position.x) * cos - (svgP.y - position.y) * sin;
    const localY = (svgP.x - position.x) * sin + (svgP.y - position.y) * cos;
    
    const { point, segment, distance } = findClosestPointOnCurve(points, { x: localX, y: localY });
    
    // Only add point if clicking close to the path (within 5 units)
    if (distance <= 5) {
      const newPoints = [...points];
      newPoints.splice(segment + 1, 0, point);
      updateOutline(id, { points: newPoints });
    }
  };

  return (
    <g transform={transformString} onMouseDown={handleMouseDown}>
      {/* Add bitmap display when in edit mode */}
      {editMode && bitmap && (
        <image
          href={bitmap.url}
          x={bitmap.position.x}
          y={bitmap.position.y}
          width={bitmap.width}
          height={bitmap.height}
          style={{ opacity: 0.3 }}
        />
      )}
      
      <path
        d={pathD}
        fill={color}
        fillOpacity={0.2}
        stroke={selected ? "#2196f3" : color}
        strokeWidth={strokeWidth}
        onDoubleClick={handleDoubleClick}
        onClick={handlePathClick}
      />
      
      {editMode && points.map((point, i) => (
        <g key={i}>
          <circle
            cx={point.x}
            cy={point.y}
            r={handleSize}
            fill={selected ? "#2196f3" : color}
            cursor="move"
            onMouseDown={(e) => handleMouseDown(e, i)}
          />
          {points.length > 3 && (
            <circle
              cx={point.x + deleteHandleOffset / zoomFactor}
              cy={point.y - deleteHandleOffset / zoomFactor}
              r={deleteHandleSize}
              fill="red"
              cursor="not-allowed"
              onClick={(e) => handlePointDelete(i, e)}
            />
          )}
        </g>
      ))}

      {selected && !editMode && (
        <TransformHandles
          points={points}
          position={position}
          rotation={rotation}
          onRotate={handleRotateRequest}
          bounds={bounds}
        />
      )}
    </g>
  );
};

export default Outline;
