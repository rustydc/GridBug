import React, { useRef } from 'react';
import { Point, Bounds } from '../types';
import { useStore } from '../store';
import { generateSplinePath, findClosestPointOnCurve } from '../utils/spline';
import { transformPoint, untransformPoint } from '../utils/geometry';
import TransformHandles from './TransformHandles';

interface OutlineProps {
  id: string;
  bounds: Bounds;
  points: Point[];
  position: Point;
  rotation: number;
  selected: boolean;
  editMode: boolean;
  color: string;
  bitmap?: {
    url: string;
    width: number;
    height: number;
    position: Point;
  };
}

const Outline: React.FC<OutlineProps> = ({ 
  id, bounds, points, position, rotation, selected, editMode, color, bitmap
}) => {
  const dragRef = useRef<{ startX: number; startY: number; pointIndex?: number }>({ startX: 0, startY: 0 });
  const { updateOutline, selectOutline, updateMultipleOutlines, outlines, viewState } = useStore();
  const svgRef = useRef<SVGElement | null>(null);
  const zoomFactor = viewState.zoom;

  // Center of bounds already calculated in bounds object
  
  // Transform points to canvas space using shared utility function
  const transformedPoints = points.map(point => transformPoint(point, position, rotation));
  
  // Generate spline path in canvas space
  const pathD = generateSplinePath(transformedPoints);
  
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

    // For point indices, we need to use the original (untransformed) points
    if (pointIndex !== undefined) {
      // Transform the SVG point to the outline's local coordinate system
      const localPoint = untransformPoint(svgP, position, rotation);
      
      dragRef.current = { 
        startX: localPoint.x - points[pointIndex].x,
        startY: localPoint.y - points[pointIndex].y,
        pointIndex
      };
    } else {
      dragRef.current = { 
        startX: svgP.x - position.x,
        startY: svgP.y - position.y,
        pointIndex
      };
    }

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
      // Transform the SVG point to the outline's local coordinate system
      const localPoint = untransformPoint(svgP, position, rotation);
      
      const newPoints = [...points];
      newPoints[dragRef.current.pointIndex] = {
        x: localPoint.x - dragRef.current.startX,
        y: localPoint.y - dragRef.current.startY
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

  // No longer need handleRotateRequest as TransformHandles handles rotation directly

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
    const localPoint = untransformPoint(svgP, position, rotation);
    
    const { point, segment, distance } = findClosestPointOnCurve(points, localPoint);
    
    // Only add point if clicking close to the path (within 5 units)
    if (distance <= 5) {
      const newPoints = [...points];
      newPoints.splice(segment + 1, 0, point);
      updateOutline(id, { points: newPoints });
    }
  };

  return (
    <>
      {/* Render spline path directly in canvas space (no transform) */}
      <path
        d={pathD}
        fill={color}
        fillOpacity={0.2}
        stroke={selected ? "#2196f3" : color}
        strokeWidth={strokeWidth}
        onDoubleClick={handleDoubleClick}
        onClick={handlePathClick}
        onMouseDown={(e) => handleMouseDown(e)}
      />
      
      {/* Bitmap still needs the transform because it's in local space */}
      <g transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}>
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
        
        {/* Render edit points in local coordinate system */}
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

        {/* Keep transform handles in local space */}
        {selected && !editMode && (
          <TransformHandles
            points={points}
            position={position}
            rotation={rotation}
            bounds={bounds}
            outlineId={id}
          />
        )}
      </g>
    </>
  );
};

export default Outline;
