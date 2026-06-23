'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Timeline3D - Time Machine style 3D visualization
 * Uses data from core/timeline-visualizer.ts
 */

interface ThreeJSData {
  positions: number[];
  colors: number[];
  sizes: number[];
  labels: string[];
  connections: number[];
}

interface Timeline3DProps {
  data: ThreeJSData;
  onCheckpointSelect?: (index: number) => void;
  selectedIndex?: number;
}

function CheckpointNodes({ data, onCheckpointSelect, selectedIndex }: Timeline3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Create geometry from positions
  const nodeCount = data.positions.length / 3;
  
  return (
    <group ref={groupRef}>
      {/* Connection lines */}
      {Array.from({ length: data.connections.length / 2 }).map((_, i) => {
        const fromIdx = data.connections[i * 2];
        const toIdx = data.connections[i * 2 + 1];
        const from = new THREE.Vector3(
          data.positions[fromIdx * 3],
          data.positions[fromIdx * 3 + 1],
          data.positions[fromIdx * 3 + 2]
        );
        const to = new THREE.Vector3(
          data.positions[toIdx * 3],
          data.positions[toIdx * 3 + 1],
          data.positions[toIdx * 3 + 2]
        );
        return (
          <Line
            key={`line-${i}`}
            points={[from, to]}
            color="#4a9eff"
            lineWidth={1}
            opacity={0.5}
            transparent
          />
        );
      })}

      {/* Checkpoint spheres */}
      {Array.from({ length: nodeCount }).map((_, i) => {
        const x = data.positions[i * 3];
        const y = data.positions[i * 3 + 1];
        const z = data.positions[i * 3 + 2];
        const r = data.colors[i * 3];
        const g = data.colors[i * 3 + 1];
        const b = data.colors[i * 3 + 2];
        const size = data.sizes[i] * 0.3;
        const isSelected = i === selectedIndex;
        const isHovered = i === hovered;

        return (
          <group key={`node-${i}`} position={[x, y, z]}>
            <mesh
              onClick={() => onCheckpointSelect?.(i)}
              onPointerOver={() => setHovered(i)}
              onPointerOut={() => setHovered(null)}
            >
              <sphereGeometry args={[isSelected ? size * 1.5 : size, 16, 16]} />
              <meshStandardMaterial
                color={new THREE.Color(r, g, b)}
                emissive={isSelected ? '#00ff00' : isHovered ? '#ffffff' : '#000000'}
                emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.3 : 0}
              />
            </mesh>
            {(isHovered || isSelected) && (
              <Text
                position={[0, size + 0.3, 0]}
                fontSize={0.2}
                color="white"
                anchorX="center"
                anchorY="bottom"
              >
                {data.labels[i]}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

function CameraController({ selectedIndex, positions }: { selectedIndex?: number; positions: number[] }) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (selectedIndex !== undefined && positions.length > selectedIndex * 3) {
      const x = positions[selectedIndex * 3];
      const y = positions[selectedIndex * 3 + 1];
      const z = positions[selectedIndex * 3 + 2];
      
      // Animate camera to selected checkpoint
      camera.position.lerp(new THREE.Vector3(x + 3, y + 2, z + 5), 0.1);
      camera.lookAt(x, y, z);
    }
  }, [selectedIndex, positions, camera]);

  return null;
}

export default function Timeline3D({ data, onCheckpointSelect, selectedIndex }: Timeline3DProps) {
  return (
    <div className="w-full h-[600px] bg-gray-900 rounded-lg overflow-hidden">
      <Canvas camera={{ position: [5, 3, 10], fov: 60 }}>
        <color attach="background" args={['#0a0a0a']} />
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4a9eff" />
        
        <CheckpointNodes
          data={data}
          onCheckpointSelect={onCheckpointSelect}
          selectedIndex={selectedIndex}
        />
        
        <CameraController selectedIndex={selectedIndex} positions={data.positions} />
        <OrbitControls enableDamping dampingFactor={0.05} />
        
        {/* Grid for reference */}
        <gridHelper args={[20, 20, '#333333', '#222222']} position={[5, -2, 0]} />
      </Canvas>
    </div>
  );
}
