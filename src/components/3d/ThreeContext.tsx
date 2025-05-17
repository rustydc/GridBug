/* eslint-disable react/no-unknown-property */
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// We change the default orientation - threejs tends to use Y are the height,
// while replicad uses Z. This is mostly a representation default.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

interface ThreeContextProps {
  children: React.ReactNode;
  width: number;
  height: number;
}

// This is the basics to render a nice looking model using react-three-fiber
export default function ThreeContext({ children, width, height }: ThreeContextProps) {
  const dpr = Math.min(window.devicePixelRatio, 2);

  return (
    <Suspense fallback={<div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading 3D...</div>}>
      <Canvas
        style={{
          width: width,
          height: height,
          backgroundColor: "#fff",
        }}
        dpr={dpr}
        frameloop="demand"
        camera={{ position: [50, 70, 100], fov: 50 }}
      >
        <OrbitControls makeDefault enableDamping dampingFactor={0.2} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[100, 100, 100]} intensity={1.2} />
        <directionalLight position={[-100, 50, -100]} intensity={0.9} />
        {children}
      </Canvas>
    </Suspense>
  );
}