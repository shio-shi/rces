// @ts-nocheck -- binary parser; indexed access is bounds-checked by format.
// Converts Roblox .mesh files (versions 1.x - 5.x) to plain geometry arrays.

export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
};

export function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function parseV1(text: string, version: string): MeshData {
  const lines = text.split(/\r?\n/);
  const nFaces = parseInt(lines[1], 10);
  const nums = (lines[2] ?? "").match(/-?[\d.]+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const scale = version === "1.00" ? 0.5 : 1;
  const nVerts = nFaces * 3;
  const positions = new Float32Array(nVerts * 3);
  const normals = new Float32Array(nVerts * 3);
  const uvs = new Float32Array(nVerts * 2);
  for (let v = 0; v < nVerts; v++) {
    const b = v * 9;
    positions.set([nums[b] * scale, nums[b + 1] * scale, nums[b + 2] * scale], v * 3);
    normals.set([nums[b + 3], nums[b + 4], nums[b + 5]], v * 3);
    uvs.set([nums[b + 6], nums[b + 7]], v * 2);
  }
  return { positions, normals, uvs, indices: Uint32Array.from({ length: nVerts }, (_, i) => i) };
}

export function parseRobloxMesh(bytes: Uint8Array): MeshData {
  const header = new TextDecoder().decode(bytes.subarray(0, 12));
  const m = header.match(/^version (\d\.\d\d)/);
  if (!m) throw new Error("Not a Roblox .mesh file.");
  const version = m[1];
  if (version.startsWith("1")) return parseV1(new TextDecoder().decode(bytes), version);
  const major = parseInt(version[0], 10);
  if (major > 5) throw new Error(`Mesh version ${version} is not supported yet (use v2-v5).`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 13; // "version x.xx\n"
  const hStart = p;
  const hSize = dv.getUint16(p, true);
  let vSize = 40, nVerts = 0, nFaces = 0, nLods = 0, nBones = 0, lodSize = 4;
  if (major === 2) {
    vSize = dv.getUint8(p + 2);
    nVerts = dv.getUint32(p + 4, true);
    nFaces = dv.getUint32(p + 8, true);
  } else if (major === 3) {
    vSize = dv.getUint8(p + 2);
    lodSize = dv.getUint16(p + 4, true);
    nLods = dv.getUint16(p + 6, true);
    nVerts = dv.getUint32(p + 8, true);
    nFaces = dv.getUint32(p + 12, true);
  } else {
    nVerts = dv.getUint32(p + 4, true);
    nFaces = dv.getUint32(p + 8, true);
    nLods = dv.getUint16(p + 12, true);
    nBones = dv.getUint16(p + 14, true);
  }
  p = hStart + hSize;
  const positions = new Float32Array(nVerts * 3);
  const normals = new Float32Array(nVerts * 3);
  const uvs = new Float32Array(nVerts * 2);
  for (let i = 0; i < nVerts; i++) {
    const b = p + i * vSize;
    positions[i * 3] = dv.getFloat32(b, true);
    positions[i * 3 + 1] = dv.getFloat32(b + 4, true);
    positions[i * 3 + 2] = dv.getFloat32(b + 8, true);
    normals[i * 3] = dv.getFloat32(b + 12, true);
    normals[i * 3 + 1] = dv.getFloat32(b + 16, true);
    normals[i * 3 + 2] = dv.getFloat32(b + 20, true);
    uvs[i * 2] = dv.getFloat32(b + 24, true);
    uvs[i * 2 + 1] = dv.getFloat32(b + 28, true);
  }
  p += nVerts * vSize;
  if (major >= 4 && nBones > 0) p += nVerts * 8;
  const faceStart = p;
  p += nFaces * 12;
  let faceCount = nFaces;
  if (nLods > 1) {
    const lod1 = dv.getUint32(p + lodSize, true);
    if (lod1 > 0 && lod1 <= nFaces) faceCount = lod1;
  }
  const indices = new Uint32Array(faceCount * 3);
  for (let i = 0; i < faceCount * 3; i++) indices[i] = dv.getUint32(faceStart + i * 4, true);
  return { positions, normals, uvs, indices };
}
