import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { parseRobloxMesh, base64ToBytes } from "@/lib/robloxMesh";
import type { AccessoryMeta } from "@/lib/rbxm";
import faceAsset from "@/assets/classic-face.png.asset.json";
import headAsset from "@/assets/classic-head.mesh.asset.json";

export type AvatarColors = {
  head: string;
  torso: string;
  left_arm: string;
  right_arm: string;
  left_leg: string;
  right_leg: string;
};

export type LoadedAccessory = {
  itemId: string;
  kind: string;
  meta: AccessoryMeta;
  mesh_b64: string | null;
  texture_data_url: string | null;
};

// R6 character attachment points in world space (studs), torso center at y=3.
const ATTACH: Record<string, [number, number, number]> = {
  HatAttachment: [0, 5.1, 0],
  HairAttachment: [0, 5.1, 0],
  FaceFrontAttachment: [0, 4.5, -0.6],
  FaceCenterAttachment: [0, 4.5, 0],
  NeckAttachment: [0, 4, 0],
  BodyFrontAttachment: [0, 3, -0.5],
  BodyBackAttachment: [0, 3, 0.5],
  LeftCollarAttachment: [-1, 4, 0],
  RightCollarAttachment: [1, 4, 0],
  LeftShoulderAttachment: [-1.5, 4, 0],
  RightShoulderAttachment: [1.5, 4, 0],
  WaistFrontAttachment: [0, 2, -0.5],
  WaistCenterAttachment: [0, 2, 0],
  WaistBackAttachment: [0, 2, 0.5],
  RightGripAttachment: [1.5, 2, 0],
};

const KIND_DEFAULT: Record<string, string> = {
  hat: "HatAttachment",
  hair: "HairAttachment",
  face: "FaceFrontAttachment",
  neck: "NeckAttachment",
  shoulder: "RightShoulderAttachment",
  front: "BodyFrontAttachment",
  back: "BodyBackAttachment",
  waist: "WaistBackAttachment",
  gear: "RightGripAttachment",
};

function useFaceTexture() {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    let t: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      setTex(t);
    };
    img.src = faceAsset.url;
    return () => {
      cancelled = true;
      t?.dispose();
    };
  }, []);
  return tex;
}
function useHeadMesh() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let cancelled = false;
    let g: THREE.BufferGeometry | null = null;
    fetch(headAsset.url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (cancelled) return;
        const m = parseRobloxMesh(new Uint8Array(buf));
        g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
        g.setIndex(new THREE.BufferAttribute(m.indices, 1));
        setGeo(g);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      g?.dispose();
    };
  }, []);
  return geo;
}


function Part({
  size,
  position,
  color,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
}) {
  return (
    <RoundedBox args={size} radius={0.06} smoothness={3} position={position} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </RoundedBox>
  );
}

function Accessory({ acc }: { acc: LoadedAccessory }) {
  const geometry = useMemo(() => {
    if (!acc.mesh_b64) return null;
    try {
      const m = parseRobloxMesh(base64ToBytes(acc.mesh_b64));
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeBoundingBox();
      return g;
    } catch {
      return null;
    }
  }, [acc.mesh_b64]);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!acc.texture_data_url) return setTexture(null);
    let cancelled = false;
    let tex: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.onerror = () => console.warn("Accessory texture failed to load");
    img.src = acc.texture_data_url;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [acc.texture_data_url]);

  const matrix = useMemo(() => {
    const meta = acc.meta;
    const name =
      meta.attachmentName && ATTACH[meta.attachmentName]
        ? meta.attachmentName
        : KIND_DEFAULT[acc.kind] ?? "HatAttachment";
    const charPos = ATTACH[name] ?? [0, 5.1, 0];
    const charM = new THREE.Matrix4().makeTranslation(...charPos);
    if (name === "RightGripAttachment") charM.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const r = (meta.attachmentRot?.length === 9 ? meta.attachmentRot : [1, 0, 0, 0, 1, 0, 0, 0, 1]) as [number, number, number, number, number, number, number, number, number];
    const accM = new THREE.Matrix4().set(
      r[0], r[1], r[2], meta.attachmentPos[0],
      r[3], r[4], r[5], meta.attachmentPos[1],
      r[6], r[7], r[8], meta.attachmentPos[2],
      0, 0, 0, 1,
    );
    const handle = charM.multiply(accM.invert());
    // Mesh scale inside the handle
    let s = new THREE.Vector3(...meta.scale);
    if (meta.isMeshPart && geometry?.boundingBox) {
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      s = new THREE.Vector3(
        size.x ? meta.handleSize[0] / size.x : 1,
        size.y ? meta.handleSize[1] / size.y : 1,
        size.z ? meta.handleSize[2] / size.z : 1,
      );
    }
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...meta.offset),
      new THREE.Quaternion(),
      s,
    );
    return handle.multiply(local);
  }, [acc, geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false} castShadow>
      <meshStandardMaterial
        key={texture ? texture.uuid : "none"}
        map={texture}
        color={texture ? "#ffffff" : "#a3a2a5"}
        roughness={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Character({ colors, accessories }: { colors: AvatarColors; accessories: LoadedAccessory[] }) {
  const face = useFaceTexture();
  const headGeo = useHeadMesh();
  return (
    <group>
      {headGeo ? (
        <mesh geometry={headGeo} position={[0, 4.5, 0]} castShadow>
          <meshStandardMaterial color={colors.head} roughness={0.55} />
        </mesh>
      ) : (
        <RoundedBox args={[1.2, 1.2, 1.2]} radius={0.4} smoothness={16} position={[0, 4.5, 0]} castShadow>
          <meshStandardMaterial color={colors.head} roughness={0.55} />
        </RoundedBox>
      )}
      {face && (
        <mesh position={[0, 4.5, -0.601]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshStandardMaterial map={face} transparent roughness={0.55} />
        </mesh>
      )}
      <Part size={[2, 2, 1]} position={[0, 3, 0]} color={colors.torso} />
      <Part size={[1, 2, 1]} position={[-1.5, 3, 0]} color={colors.left_arm} />
      <Part size={[1, 2, 1]} position={[1.5, 3, 0]} color={colors.right_arm} />
      <Part size={[0.98, 2, 1]} position={[-0.5, 1, 0]} color={colors.left_leg} />
      <Part size={[0.98, 2, 1]} position={[0.5, 1, 0]} color={colors.right_leg} />
      {accessories.map((a) => (
        <Accessory key={a.itemId} acc={a} />
      ))}
    </group>
  );
}

export function Avatar3D({
  colors,
  accessories,
}: {
  colors: AvatarColors;
  accessories: LoadedAccessory[];
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [-3, 4.5, -9], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[-5, 10, -6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <Suspense fallback={null}>
          <Environment resolution={64}>
            <Lightformer intensity={2} position={[0, 6, -4]} scale={[10, 10, 1]} />
            <Lightformer intensity={1} position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
          </Environment>
        </Suspense>
        <Character colors={colors} accessories={accessories} />
        <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
  <planeGeometry args={[20, 20]} />
  <shadowMaterial opacity={0.25} />
</mesh>
<OrbitControls
  ref={controls}
  target={[0, 3, 0]}
  enablePan={false}
  minDistance={5}
  maxDistance={16}
  maxPolarAngle={Math.PI * 0.6}
  />
</Canvas>
      <button
        onClick={() => controls.current?.reset()}
        className="absolute bottom-2 right-2 rounded-md border border-border bg-card px-2 py-1 text-xs font-bold hover:bg-accent"
      >
        Reset camera
      </button>
    </div>
  );
}
// removed floor disc.
