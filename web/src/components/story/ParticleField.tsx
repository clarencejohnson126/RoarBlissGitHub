"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 1300; // single draw call, light on the GPU

function Embers() {
  const points = useRef<THREE.Points>(null);
  const pointer = useRef({ x: 0, y: 0 });

  // build positions + per-particle drift speed once
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 24; // x
      positions[i * 3 + 1] = (Math.random() - 0.5) * 16; // y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10; // z
      speeds[i] = 0.06 + Math.random() * 0.14;
    }
    return { positions, speeds };
  }, []);

  const texture = useMemo(() => {
    // soft round ember sprite drawn on a canvas
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,224,160,1)");
    g.addColorStop(0.4, "rgba(214,168,79,0.6)");
    g.addColorStop(1, "rgba(214,168,79,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }, []);

  useFrame((state: RootState, delta: number) => {
    const pts = points.current;
    if (!pts) return;
    const arr = (pts.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const d = Math.min(delta, 0.05);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * d; // drift upward
      arr[i * 3 + 0] += Math.sin(state.clock.elapsedTime * 0.3 + i) * 0.002; // gentle sway
      if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = -8; // recycle
    }
    (pts.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // cursor-reactive parallax: lerp group toward pointer
    const px = state.pointer.x;
    const py = state.pointer.y;
    pointer.current.x = THREE.MathUtils.lerp(pointer.current.x, px, 0.03);
    pointer.current.y = THREE.MathUtils.lerp(pointer.current.y, py, 0.03);
    pts.rotation.y = pointer.current.x * 0.18;
    pts.rotation.x = -pointer.current.y * 0.12;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        size={0.12}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.7}
        color={"#D6A84F"}
      />
    </points>
  );
}

export default function ParticleField() {
  return (
    <Canvas
      camera={{ position: [0, 0, 12], fov: 60 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Embers />
    </Canvas>
  );
}
