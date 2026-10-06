import type * as THREE from "three";
import { DRACOLoader } from "three-stdlib";
import {
  getMeshVersion,
  meshDataToV2Bytes,
  readV7Container,
  type MeshData,
} from "@/lib/robloxMesh";

// Roblox mesh v7 stores its geometry as a Draco stream. If textures appear upside
// down on v7 hair but not on older accessories, flip this to true.
const FLIP_V = false;

let loader: DRACOLoader | null = null;
function getLoader() {
  if (!loader) {
    loader = new DRACOLoader();
    // Same decoder host that @react-three/drei uses for GLTF files.
    loader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
  }
  return loader;
}

function decodeDraco(buffer: ArrayBuffer): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Draco decoder timed out (could not load the decoder from gstatic.com).")),
      20000,
    );
    try {
      getLoader().decodeDracoFile(
        buffer,
        (geo: THREE.BufferGeometry) => {
          clearTimeout(timer);
          resolve(geo);
        },
        undefined,
        undefined,
      );
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function parseV7(bytes: Uint8Array): Promise<MeshData> {
  const { draco, lod0Faces } = readV7Container(bytes);
  // decodeDracoFile transfers the buffer to a worker, so hand it a copy.
  const geo = await decodeDraco(draco.slice().buffer);

  const pos = geo.getAttribute("position");
  if (!pos) throw new Error("Mesh v7: Draco stream has no position data.");
  const positions = Float32Array.from(pos.array as ArrayLike<number>);
  const nVerts = positions.length / 3;

  const normAttr = geo.getAttribute("normal");
  const normals = normAttr ? Float32Array.from(normAttr.array as ArrayLike<number>) : new Float32Array(nVerts * 3);

  const uvAttr = geo.getAttribute("uv");
  if (!uvAttr) console.warn("Mesh v7: no UV attribute found, texture will not map.");
  const uvs = uvAttr ? Float32Array.from(uvAttr.array as ArrayLike<number>) : new Float32Array(nVerts * 2);
  if (FLIP_V) for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1 - uvs[i];

  if (!geo.index) throw new Error("Mesh v7: Draco stream has no triangle indices.");
  let indices = Uint32Array.from(geo.index.array as ArrayLike<number>);
  // The stream holds every level of detail back to back; keep only the highest quality
  // one, otherwise the lower-detail copies would be drawn on top of it.
  if (lod0Faces && lod0Faces * 3 < indices.length) indices = indices.slice(0, lod0Faces * 3);

  if (!normAttr) {
    geo.computeVertexNormals();
    const n = geo.getAttribute("normal");
    if (n) normals.set(n.array as ArrayLike<number>);
  }

  const ROTATE_Y_180 = true; // hair faces backwards
  if (ROTATE_Y_180) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = -positions[i];         // x
      positions[i + 2] = -positions[i + 2]; // z
      normals[i] = -normals[i];
      normals[i + 2] = -normals[i + 2];
    }
  }

  geo.dispose();
  return { positions, normals, uvs, indices };
}
/**
 * Call this on the raw mesh bytes at upload time, before storing them.
 * v7 meshes are decoded and re-encoded as a v2 mesh; every other version is
 * returned unchanged. The existing synchronous parseRobloxMesh then reads the result.
 */
export async function normalizeMeshBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const version = getMeshVersion(bytes);
  if (!version) throw new Error("Not a Roblox .mesh file.");
  if (parseInt(version[0], 10) < 6) return bytes;
  if (!version.startsWith("7")) throw new Error(`Mesh version ${version} is not supported.`);
  return meshDataToV2Bytes(await parseV7(bytes));
}
