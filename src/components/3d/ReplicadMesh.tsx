import React, { useRef, useLayoutEffect, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { BufferGeometry, EdgesGeometry } from "three";
import {
  syncFaces,
  syncLines,
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
    if (!faces) return;
    
    // Sync the faces with the geometry
    syncFaces(body.current, faces);
    
    // Create a new EdgesGeometry directly
    // Threshold is in degrees - lower values hide more edges (only show edges with angle > threshold)
    const edgesGeom = new EdgesGeometry(body.current, 20);
    
    // Copy the edges geometry to our lines ref
    lines.current.dispose();
    if (edgesGeom.attributes.position) {
      lines.current.setAttribute('position', edgesGeom.attributes.position.clone());
      if (edgesGeom.index) {
        lines.current.setIndex(edgesGeom.index.clone());
      }
    } else if (edges) {
      // Fallback to original edges if EdgesGeometry failed
      syncLines(lines.current, edges);
    }
    
    // Clean up
    edgesGeom.dispose();
    
    // Force a render update
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
        <meshLambertMaterial
          color="#fff"
          polygonOffset
          polygonOffsetFactor={2.0}
          polygonOffsetUnits={1.0}
        />
      </mesh>
      <lineSegments geometry={lines.current}>
        <lineBasicMaterial color="#888" opacity={0.7} transparent />
      </lineSegments>
    </group>
  );
});