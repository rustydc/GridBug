import React from 'react';
import { Point, Bounds } from '../types';
import RotationHandles from './RotationHandles';
import RectTransformHandles from './RectTransformHandles';

interface Props {
  points?: Point[]; // Make points optional since RoundedRectOutline doesn't use them
  position: Point;
  rotation: number;
  bounds: Bounds;
  outlineId: string; // ID of the outline that owns these handles
  type?: 'spline' | 'roundedRect'; // Type of outline, used to determine which handles to show
}

// This is now a wrapper component that delegates to the appropriate specialized component
const TransformHandles: React.FC<Props> = ({ bounds, position, rotation, outlineId, type = 'spline' }) => {
  return (
    <>
      {type === 'roundedRect' && (
        <RectTransformHandles
          bounds={bounds}
          position={position}
          rotation={rotation}
          outlineId={outlineId}
        />
      )}
      <RotationHandles
        bounds={bounds}
        position={position}
        rotation={rotation}
        outlineId={outlineId}
      />
    </>
  );
};

export default TransformHandles;