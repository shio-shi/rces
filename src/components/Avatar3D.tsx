import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { RoundedBoxGeometry } from "three-stdlib";
import { parseRobloxMesh, base64ToBytes } from "@/lib/robloxMesh";
import type { AccessoryMeta } from "@/lib/rbxm";
import faceAsset from "@/assets/classic-face.png.asset.json";
import headAsset from "@/assets/classic-head.mesh.asset.json";
import {
  buildPartMaterials,
  loadImage,
  TEMPLATE_W,
  TEMPLATE_H,
  type BodyPart,
  type ClothingKind,
  type Layer,
} from "@/lib/clothing";

export type WornClothing = { itemId: string; kind: ClothingKind; template: string };

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
  meta: AccessoryMeta & { bodyPart?: boolean };
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

function useFaceTexture(customUrl?: string | null) {
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
    img.onerror = () => {
      // If a custom face fails to load, fall back to the default face
      if (!cancelled && customUrl) setTex(null);
    };
    img.src = customUrl || faceAsset.url;
    return () => {
      cancelled = true;
      t?.dispose();
    };
  }, [customUrl]);
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

// Rounded box whose UVs are projected flat per face, so classic clothing
// templates map correctly instead of smearing around the corners.
function makeRoundedPartGeometry(size: [number, number, number], radius: number, smoothness: number) {
  const [w, h, d] = size;
  const g = new RoundedBoxGeometry(w, h, d, smoothness, radius);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const index = g.index; // RoundedBoxGeometry is non-indexed, so this is usually null
  for (const grp of g.groups) {
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const v = index ? index.getX(i) : i;
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      let u = 0;
      let t = 0;
      // Face order: +x, -x, +y, -y, +z, -z (same as BoxGeometry)
      switch (grp.materialIndex) {
        case 0: u = 0.5 - z / d; t = 0.5 + y / h; break;
        case 1: u = 0.5 + z / d; t = 0.5 + y / h; break;
        case 2: u = 0.5 + x / w; t = 0.5 - z / d; break;
        case 3: u = 0.5 + x / w; t = 0.5 + z / d; break;
        case 4: u = 0.5 + x / w; t = 0.5 + y / h; break;
        default: u = 0.5 - x / w; t = 0.5 + y / h; break;
      }
      uv.setXY(v, u, t);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// ---- Classic clothing template layout (used to wrap clothing onto custom body meshes) ----
type Rect = [number, number, number, number]; // x, y, width, height in the template image
// Face order: +x, -x, +y, -y, +z (back), -z (front)
type FaceRects = [Rect, Rect, Rect, Rect, Rect, Rect];

const TORSO_RECTS: FaceRects = [
  [165, 74, 64, 128],
  [361, 74, 64, 128],
  [231, 8, 128, 64],
  [231, 204, 128, 64],
  [427, 74, 128, 128],
  [231, 74, 128, 128],
];
const RIGHT_LIMB_RECTS: FaceRects = [
  [19, 355, 64, 128],
  [151, 355, 64, 128],
  [217, 289, 64, 64],
  [217, 485, 64, 64],
  [85, 355, 64, 128],
  [217, 355, 64, 128],
];
const LEFT_LIMB_RECTS: FaceRects = [
  [506, 355, 64, 128],
  [374, 355, 64, 128],
  [308, 289, 64, 64],
  [308, 485, 64, 64],
  [440, 355, 64, 128],
  [308, 355, 64, 128],
];

function templateRects(part: BodyPart): FaceRects {
  if (part === "torso") return TORSO_RECTS;
  if (part === "right_arm" || part === "right_leg") return RIGHT_LIMB_RECTS;
  return LEFT_LIMB_RECTS;
}

function templateLayersFor(part: BodyPart, layers: Layer[]) {
  const pants = layers.filter((l) => l.kind === "pants");
  const shirt = layers.filter((l) => l.kind === "shirt");
  if (part === "torso") return [...pants, ...shirt];
  if (part.endsWith("arm")) return shirt;
  return pants;
}

const NO_LAYERS: Layer[] = [];

// Neck stub of a custom torso mesh: the mesh is measured slice by slice from the top. Slices
// that are narrower than NECK_WIDE (as a fraction of the mesh width, 1 = full width) at the very
// top are the neck and stay skin-coloured instead of getting the shirt. A torso with no neck
// piece has a wide top, so nothing is treated as neck.
// Raise NECK_WIDE if a shirt-coloured line remains; lower it if part of the shoulders or back
// turns skin-coloured.
const NECK_WIDE = 0.55;
// Size (in template pixels) of the reserved skin-colour patch in the top-left corner of the atlas
const SKIN_PATCH = 12;

// Gives a custom mesh UVs that point into the classic template, the same way the
// template wraps a plain box: every triangle goes to the front/back/left/right/top/bottom
// region of the template depending on which way it faces.
function projectTemplateUVs(src: THREE.BufferGeometry, part: BodyPart) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const ctr = bb.getCenter(new THREE.Vector3());
  const rects = templateRects(part);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const p = new THREE.Vector3();

  // Torso only: find the height (-0.5..0.5) above which the mesh is a narrow neck stub.
  // Stays at 0.5 (nothing counts as neck) when the top of the mesh is already wide.
  let neckY = 0.5;
  if (part === "torso") {
    const BINS = 48;
    const widest = new Array<number>(BINS).fill(0);
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v);
      const py = (p.y - ctr.y) / (size.y || 1);
      const px = Math.abs((p.x - ctr.x) / (size.x || 1));
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((py + 0.5) * BINS)));
      if (px > widest[b]!) widest[b] = px;
    }
    for (let b = BINS - 1; b >= 0; b--) {
      if (widest[b]! * 2 >= NECK_WIDE) {
        neckY = (b + 1) / BINS - 0.5;
        break;
      }
    }
  }

  for (let i = 0; i + 2 < pos.count; i += 3) {
    // Average of the three vertex normals decides which template face this triangle uses
    const nx = nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2);
    const ny = nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2);
    const nz = nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let face: number;
    if (ax >= ay && ax >= az) face = nx >= 0 ? 0 : 1;
    else if (ay >= az) face = ny >= 0 ? 2 : 3;
    else face = nz >= 0 ? 4 : 5;
    const r = rects[face]!;

    // Is this triangle part of the neck stub? (torso only)
    let neck = false;
    if (part === "torso" && neckY < 0.5) {
      let sy = 0;
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k);
        sy += p.y;
      }
      const cy = (sy / 3 - ctr.y) / (size.y || 1);
      neck = cy > neckY;
    }

    // Up-facing torso triangles on the back half should copy the back's top edge,
    // so the front's V-neck notch doesn't show through at the back of the neck.
    let backHalf = false;
    if (part === "torso" && face === 2) {
      let sz = 0;
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k);
        sz += p.z;
      }
      backHalf = (sz / 3 - ctr.z) / (size.z || 1) > 0;
    }

    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, i + k);
      const px = (p.x - ctr.x) / (size.x || 1);
      const py = (p.y - ctr.y) / (size.y || 1);
      const pz = (p.z - ctr.z) / (size.z || 1);
      let fu = 0;
      let ft = 0;
      switch (face) {
        case 0: fu = 0.5 - pz; ft = 0.5 + py; break;
        case 1: fu = 0.5 + pz; ft = 0.5 + py; break;
        case 2: fu = 0.5 + px; ft = 0.5 - pz; break;
        case 3: fu = 0.5 + px; ft = 0.5 + pz; break;
        case 4: fu = 0.5 + px; ft = 0.5 + py; break;
        default: fu = 0.5 - px; ft = 0.5 + py; break;
      }
      let X = r[0] + clamp01(fu) * r[2];
      let Y = r[1] + (1 - clamp01(ft)) * r[3];
      if (part === "torso" && face === 2) {
        // Shoulders / neck area of a custom torso: continue the top edge colours of the front
        // (or back, for the back half) instead of using the template's separate "top" region,
        // which causes a visible seam.
        const f = backHalf ? rects[4]! : rects[5]!;
        X = f[0] + clamp01(backHalf ? 0.5 + px : 0.5 - px) * f[2];
        Y = f[1] + 1.5;
      }
      if (neck) {
        // Centre of the skin-colour patch painted in the atlas corner
        X = SKIN_PATCH / 2;
        Y = SKIN_PATCH / 2;
      }
      uvs[(i + k) * 2] = X / TEMPLATE_W;
      uvs[(i + k) * 2 + 1] = 1 - Y / TEMPLATE_H;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return g;
}

// ---- Face painted directly onto the head mesh ----

// Size (in world studs) the face image covers on the front of the head.
// Matches the old 1.1 x 1.1 plane. Change this if the face looks too big or small.
const FACE_SIZE = 1.1;
// Size (in canvas pixels) of the reserved skin-colour patch in the face texture's corner
const FACE_SKIN_PATCH = 16;
// Triangles whose averaged normal points toward -z by more than this get the face.
// Closer to -1 = face covers less of the curve; closer to 0 = wraps further around.
const FACE_NORMAL_Z = -0.35;

// Gives the head mesh UVs so the face image is projected flat onto its front.
// Front-facing triangles get the projected UVs; everything else points at a
// skin-coloured patch in the texture's bottom-left corner.
function projectFaceUVs(src: THREE.BufferGeometry) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.computeBoundingBox();
  const ctr = g.boundingBox!.getCenter(new THREE.Vector3());
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const patch = FACE_SKIN_PATCH / 2 / 512; // centre of the skin patch, in UV space

  for (let i = 0; i + 2 < pos.count; i += 3) {
    const nz = (nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2)) / 3;
    const front = nz < FACE_NORMAL_Z; // the face looks toward -z
    for (let k = 0; k < 3; k++) {
      let u = patch;
      let v = patch;
      if (front) {
        // Viewed from the front (-z), screen-right is -x, so u grows as x shrinks
        u = clamp01(0.5 - (pos.getX(i + k) - ctr.x) / FACE_SIZE);
        v = clamp01(0.5 + (pos.getY(i + k) - ctr.y) / FACE_SIZE);
      }
      uvs[(i + k) * 2] = u;
      uvs[(i + k) * 2 + 1] = v;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return g;
}

function FacedHead({
  geometry,
  color,
  face,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  face: THREE.Texture | null;
}) {
  const faceGeo = useMemo(() => projectFaceUVs(geometry), [geometry]);
  useEffect(() => () => faceGeo.dispose(), [faceGeo]);

  const tex = useMemo(() => {
    if (!face?.image) return null;
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(face.image as CanvasImageSource, 0, 0, S, S);
    // Guaranteed plain skin patch in the bottom-left corner (UV 0,0 with flipY) for
    // every triangle that isn't on the front of the face
    ctx.fillStyle = color;
    ctx.fillRect(0, S - FACE_SKIN_PATCH, FACE_SKIN_PATCH, FACE_SKIN_PATCH);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [face, color]);
  useEffect(() => () => tex?.dispose(), [tex]);

  return (
    <mesh geometry={faceGeo} position={[0, 4.53, 0]} castShadow>
      <meshStandardMaterial
        key={tex ? tex.uuid : "none"}
        map={tex}
        color={tex ? "#ffffff" : color}
        roughness={0.55}
      />
    </mesh>
  );
}

function Part({
  size,
  position,
  color,
  part,
  layers,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  part: BodyPart;
  layers: Layer[];
}) {
  const mats = useMemo(() => buildPartMaterials(part, color, layers), [part, color, layers]);
  useEffect(
    () => () =>
      mats?.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      }),
    [mats],
  );

  const geometry = useMemo(
    () => makeRoundedPartGeometry(size, 0.1, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size[0], size[1], size[2]],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Different keys force React to build a fresh mesh when switching between the
  // clothed and plain versions, so the material is never left in a default state.
  if (mats) return <mesh key="clothed" geometry={geometry} material={mats} position={position} castShadow />;
  return (
    <mesh key="plain" geometry={geometry} position={position} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
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
    // Rows without real 3D positioning data (e.g. flat face images) must not crash the scene
    if (!meta || !meta.attachmentPos) return new THREE.Matrix4();
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

// A worn body part: the uploaded mesh is centred on the body part's slot and
// replaces the default part. Uses the skin colour unless it has its own texture.
// When a shirt / pants / t-shirt is worn, the classic template is wrapped onto the mesh.
function BodyMesh({
  acc,
  position,
  color,
  part,
  layers = NO_LAYERS,
}: {
  acc: LoadedAccessory;
  position: [number, number, number];
  color: string;
  part?: BodyPart; // omit for the head (classic clothing doesn't cover it)
  layers?: Layer[];
}) {
  const geometry = useMemo(() => {
    try {
      const m = parseRobloxMesh(base64ToBytes(acc.mesh_b64!));
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      return g;
    } catch {
      return null;
    }
  }, [acc.mesh_b64]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  // Which clothing (if any) applies to this body part
  const worn = useMemo(() => {
    if (!part) return null;
    const use = templateLayersFor(part, layers);
    const tshirt = part === "torso" ? layers.find((l) => l.kind === "tshirt") : undefined;
    return use.length > 0 || tshirt ? { use, tshirt } : null;
  }, [part, layers]);

  const clothedGeo = useMemo(
    () => (worn && geometry && part ? projectTemplateUVs(geometry, part) : null),
    [worn, geometry, part],
  );
  useEffect(() => () => clothedGeo?.dispose(), [clothedGeo]);

  const clothTex = useMemo(() => {
    if (!worn || !part) return null;
    const S = 2;
    const c = document.createElement("canvas");
    c.width = TEMPLATE_W * S;
    c.height = TEMPLATE_H * S;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    for (const l of worn.use) ctx.drawImage(l.img, 0, 0, c.width, c.height);
    if (worn.tshirt) {
      const r = templateRects(part)[5];
      ctx.drawImage(worn.tshirt.img, r[0], r[1], r[2], r[3], r[0] * S, r[1] * S, r[2] * S, r[3] * S);
    }
    if (part === "torso") {
      // Plain skin patch in an unused corner of the template, used for the neck
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, SKIN_PATCH * S, SKIN_PATCH * S);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [worn, part, color]);
  useEffect(() => () => clothTex?.dispose(), [clothTex]);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!acc.texture_data_url) return setTexture(null);
    let cancelled = false;
    let tex: THREE.Texture | null = null;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = acc.texture_data_url;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [acc.texture_data_url]);

  if (!geometry) return null;

  if (worn && clothedGeo && clothTex)
    return (
      <mesh key="clothed" geometry={clothedGeo} position={position} castShadow>
        <meshStandardMaterial key={clothTex.uuid} map={clothTex} color="#ffffff" roughness={0.55} />
      </mesh>
    );

  return (
    <mesh key="plain" geometry={geometry} position={position} castShadow>
      <meshStandardMaterial
        key={texture ? texture.uuid : "none"}
        map={texture}
        color={texture ? "#ffffff" : color}
        roughness={0.55}
      />
    </mesh>
  );
}

function useLayers(clothing: WornClothing[]) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const key = clothing.map((c) => c.itemId).join(",");
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      clothing.map(async (c) => ({ kind: c.kind, img: await loadImage(c.template) }) as Layer),
    )
      .then((l) => !cancelled && setLayers(l))
      .catch(() => !cancelled && setLayers([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return layers;
}

function Character({
  colors,
  accessories,
  clothing,
  faceUrl,
}: {
  colors: AvatarColors;
  accessories: LoadedAccessory[];
  clothing: WornClothing[];
  faceUrl?: string | null;
}) {
  const layers = useLayers(clothing);
  const face = useFaceTexture(faceUrl);
  const headGeo = useHeadMesh();
  const body: { head?: LoadedAccessory; torso?: LoadedAccessory; arm?: LoadedAccessory; leg?: LoadedAccessory } = {};
  for (const a of accessories) if (a.meta?.bodyPart && a.mesh_b64) body[a.kind as "head"] = a;
  return (
    <group>
      {body.head ? (
        <BodyMesh acc={body.head} position={[0, 4.53, 0]} color={colors.head} />
      ) : headGeo ? (
        // Face is painted directly onto the head mesh (no floating plane)
        <FacedHead geometry={headGeo} color={colors.head} face={face} />
      ) : (
        <RoundedBox args={[1.2, 1.2, 1.2]} radius={0.4} smoothness={16} position={[0, 4.53, 0]} castShadow>
          <meshStandardMaterial color={colors.head} roughness={0.55} />
        </RoundedBox>
      )}
      {/* Floating plane is only a fallback for when the face can't be painted on the head
          (custom head meshes, or while the default head mesh is still loading) */}
      {face && (body.head || !headGeo) && (
        <mesh position={[0, 4.53, -0.601]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshStandardMaterial map={face} transparent roughness={0.55} />
        </mesh>
      )}
      {body.torso ? (
        <BodyMesh acc={body.torso} position={[0, 3, 0]} color={colors.torso} part="torso" layers={layers} />
      ) : (
        <Part size={[2, 2, 1]} position={[0, 3, 0]} color={colors.torso} part="torso" layers={layers} />
      )}
      {body.arm ? (
        <>
          <BodyMesh acc={body.arm} position={[-1.5, 3, 0]} color={colors.left_arm} part="left_arm" layers={layers} />
          <BodyMesh acc={body.arm} position={[1.5, 3, 0]} color={colors.right_arm} part="right_arm" layers={layers} />
        </>
      ) : (
        <>
          <Part size={[1, 2, 1]} position={[-1.5, 3, 0]} color={colors.left_arm} part="left_arm" layers={layers} />
          <Part size={[1, 2, 1]} position={[1.5, 3, 0]} color={colors.right_arm} part="right_arm" layers={layers} />
        </>
      )}
      {body.leg ? (
        <>
          <BodyMesh acc={body.leg} position={[-0.5, 1, 0]} color={colors.left_leg} part="left_leg" layers={layers} />
          <BodyMesh acc={body.leg} position={[0.5, 1, 0]} color={colors.right_leg} part="right_leg" layers={layers} />
        </>
      ) : (
        <>
          <Part size={[0.98, 2, 1]} position={[-0.5, 1, 0]} color={colors.left_leg} part="left_leg" layers={layers} />
          <Part size={[0.98, 2, 1]} position={[0.5, 1, 0]} color={colors.right_leg} part="right_leg" layers={layers} />
        </>
      )}
      {accessories
        .filter((a) => a.mesh_b64 && a.meta?.attachmentPos && !a.meta?.bodyPart)
        .map((a) => (
          <Accessory key={a.itemId} acc={a} />
        ))}
    </group>
  );
}

export function Avatar3D({
  colors,
  accessories,
  clothing = [],
  faceUrl = null,
}: {
  colors: AvatarColors;
  accessories: LoadedAccessory[];
  clothing?: WornClothing[];
  faceUrl?: string | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 1.5]} frameloop="demand" camera={{ position: [-3, 4.5, -9], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[-5, 10, -6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <Suspense fallback={null}>
          <Environment resolution={64}>
            <Lightformer intensity={2} position={[0, 6, -4]} scale={[10, 10, 1]} />
            <Lightformer intensity={1} position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
          </Environment>
        </Suspense>
        <Character colors={colors} accessories={accessories} clothing={clothing} faceUrl={faceUrl} />
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
