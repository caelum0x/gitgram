'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';

interface TimelineVisualizerProps {
  checkpoints: Array<{ id: string; timestamp: string; description: string }>;
  currentIndex: number;
  onSelect: (index: number) => void;
}

function TimelinePoints({ checkpoints, currentIndex, onSelect }: TimelineVisualizerProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.001;
    }
  });

  const points = checkpoints.map((_, i) => {
    const angle = (i / checkpoints.length) * Math.PI * 2;
    const radius = 5;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      (i - currentIndex) * 0.5,
      Math.sin(angle) * radius
    );
  });

  return (
    <group ref={groupRef}>
      <Line points={points} color="cyan" lineWidth={2} />
      {checkpoints.map((cp, i) => (
        <mesh
          key={cp.id}
          position={points[i]}
          onClick={() => onSelect(i)}
        >
          <sphereGeometry args={[i === currentIndex ? 0.3 : 0.15, 16, 16]} />
          <meshStandardMaterial
            color={i === currentIndex ? '#00ff00' : '#ffffff'}
            emissive={i === currentIndex ? '#00ff00' : '#000000'}
            emissiveIntensity={i === currentIndex ? 0.5 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function TimelineVisualizer(props: TimelineVisualizerProps) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 5, 10], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <TimelinePoints {...props} />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
