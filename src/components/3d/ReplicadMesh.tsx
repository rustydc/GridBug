import React, { useRef, useLayoutEffect, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { BufferGeometry } from "three";
import {
  syncFaces,
  syncLines,
  syncLinesFromFaces,
} from "replicad-threejs-helper";

/* eslint-disable react/no-unknown-property */
// Define interfaces for faces and edges
interface ReplicadFaces {
  readonly indices: number[];
  readonly vertices: number[];
  readonly triangles: number[];
  readonly normals?: number[];
  readonly faceGroups?: { start: number; count: number; faceId: number; }[];
}

interface ReplicadEdges {
  readonly vertices: number[];
  readonly lines: number[];
  readonly edgeGroups?: { start: number; count: number; edgeId: number; }[];
}

interface ReplicadMeshProps {
  faces: ReplicadFaces;
  edges: ReplicadEdges;
}

export default React.memo(function ReplicadMesh({ faces, edges }: ReplicadMeshProps) {
  const { invalidate } = useThree();

  const body = useRef<BufferGeometry>(new BufferGeometry());
  const lines = useRef<BufferGeometry>(new BufferGeometry());

  useLayoutEffect(() => {
    // We use the three helpers to synchronise the buffer geometry with the
    // new data from the parameters
    if (faces) syncFaces(body.current, faces);

    if (edges) syncLines(lines.current, edges);
    else if (faces) syncLinesFromFaces(lines.current, body.current);

    // We have configured the canvas to only refresh when there is a change,
    // the invalidate function is here to tell it to recompute
    invalidate();
  }, [faces, edges, invalidate]);

  useEffect(
    () => () => {
      body.current.dispose();
      lines.current.dispose();
      invalidate();
    },
    [invalidate]
  );

  return (
    <group>
      <mesh geometry={body.current}>
        {/* the offsets are here to avoid z fighting between the mesh and the lines */}
        <meshStandardMaterial
          color="#1976d2"
          polygonOffset
          polygonOffsetFactor={2.0}
          polygonOffsetUnits={1.0}
        />
      </mesh>
      <lineSegments geometry={lines.current}>
        <lineBasicMaterial color="#000000" />
      </lineSegments>
    </group>
  );
});