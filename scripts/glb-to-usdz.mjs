#!/usr/bin/env node
/**
 * GLB -> USDZ for iOS AR Quick Look.
 *
 * Quick Look is the only way to get real ARKit world tracking on iOS Safari
 * (Safari has no WebXR immersive-ar), and it needs a static .usdz served with
 * Content-Type model/vnd.usd+zip. Blob URLs do not work for `rel="ar"`.
 *
 * Deliberately dependency-free: it reads the GLB directly and emits USDA, then
 * uses the USD tools shipped with macOS (usdcat/usdzip/usdchecker) to package
 * and validate. Supports multi-mesh / multi-material scenes with vertex-color
 * or flat materials (the resort island case); textured single-mesh models keep
 * the original embedded-texture path. It fails loudly rather than silently
 * dropping data.
 *
 *   node scripts/glb-to-usdz.mjs [--size <metres>] [--in <glb>] [--out <usdz>]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  // Last occurrence wins, so CLI args override npm-script defaults.
  let value = fallback;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1]) value = args[i + 1];
  }
  return value;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inPath = resolve(root, flag("in", "public/assets/models/property.glb"));
const outPath = resolve(root, flag("out", "public/assets/models/property.usdz"));
/** Longest horizontal edge of the model in the real world, in metres. */
const targetSize = Number(flag("size", "0.6"));

const die = (msg) => {
  console.error(`glb-to-usdz: ${msg}`);
  process.exit(1);
};

/* ---------- parse GLB ---------- */

const glb = readFileSync(inPath);
if (glb.readUInt32LE(0) !== 0x46546c67) die("not a GLB (bad magic)");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
const binStart = 20 + jsonLength + 8; // skip BIN chunk header
const bin = glb.subarray(binStart);

const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

const view = (index) => {
  const bv = gltf.bufferViews[index];
  if (!bv) die(`missing bufferView ${index}`);
  const start = bv.byteOffset ?? 0;
  return { bytes: bin.subarray(start, start + bv.byteLength), stride: bv.byteStride ?? 0 };
};

const readAccessor = (index) => {
  const a = gltf.accessors[index];
  if (!a) die(`missing accessor ${index}`);
  if (a.sparse) die("sparse accessors are not supported");
  const components = COMP[a.type];
  if (!components) die(`unsupported accessor type ${a.type}`);
  const size = COMP_SIZE[a.componentType];
  if (!size) die(`unsupported componentType ${a.componentType}`);
  const { bytes, stride } = view(a.bufferView);
  if (stride !== 0 && stride !== components * size) die("strided bufferViews are not supported");
  const offset = a.byteOffset ?? 0;
  const count = a.count * components;
  const ab = bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + bytes.length);
  if (a.componentType === 5126) return { data: new Float32Array(ab, 0, count), components };
  if (a.componentType === 5125) return { data: new Uint32Array(ab, 0, count), components };
  if (a.componentType === 5123) return { data: new Uint16Array(ab, 0, count), components };
  if (a.componentType === 5121) return { data: new Uint8Array(ab, 0, count), components };
  return die(`unsupported componentType ${a.componentType}`);
};

/* ---------- node transforms (column-major mat4) ---------- */

const mat4Identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mat4Mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
  return o;
};
const quatToMat4 = (t, q, s) => {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
};
const nodeLocal = (n) => {
  if (n.matrix) return [...n.matrix];
  return quatToMat4(n.translation ?? [0, 0, 0], n.rotation ?? [0, 0, 0, 1], n.scale ?? [1, 1, 1]);
};
const xformPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
// inverse-transpose of the upper 3x3, for normals
const xformNormal = (m, x, y, z) => {
  const a = m[0],
    b = m[1],
    c = m[2],
    d = m[4],
    e = m[5],
    f = m[6],
    g = m[8],
    h = m[9],
    i = m[10];
  const A = e * i - f * h,
    B = f * g - d * i,
    C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const nx = (A * x + B * y + C * z) / det;
  const ny = ((c * h - b * i) * x + (a * i - c * g) * y + (b * g - a * h) * z) / det;
  const nz = ((b * f - c * e) * x + (c * d - a * f) * y + (a * e - b * d) * z) / det;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
};

/* ---------- collect primitives (world-baked) ---------- */

const f = (n) => (Object.is(n, -0) ? "0" : Number(n.toFixed(6)).toString());

const computeNormals = (positions, triIndices) => {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);
  for (let k = 0; k < triIndices.length; k += 3) {
    const [ia, ib, ic] = [triIndices[k] * 3, triIndices[k + 1] * 3, triIndices[k + 2] * 3];
    const ax = positions[ia],
      ay = positions[ia + 1],
      az = positions[ia + 2];
    const e1x = positions[ib] - ax,
      e1y = positions[ib + 1] - ay,
      e1z = positions[ib + 2] - az;
    const e2x = positions[ic] - ax,
      e2y = positions[ic + 1] - ay,
      e2z = positions[ic + 2] - az;
    const nx = e1y * e2z - e1z * e2y,
      ny = e1z * e2x - e1x * e2z,
      nz = e1x * e2y - e1y * e2x;
    for (const base of [ia, ib, ic]) {
      normals[base] += nx;
      normals[base + 1] += ny;
      normals[base + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
};

const parts = []; // { positions, normals, triIndices, baseColor, metallic, roughness, doubleSided }
let warnedUVs = false;
const hasEmbeddedImages = () => (gltf.images ?? []).some((img) => img.bufferView !== undefined);
const materialOf = (meshIndex, prim) => {
  if (prim.material === undefined) return {};
  const m = gltf.materials?.[prim.material];
  if (!m) die(`mesh ${meshIndex} references missing material ${prim.material}`);
  return m;
};

const bakePrimitive = (meshIndex, meshName, prim, world) => {
  if ((prim.mode ?? 4) !== 4)
    die(`mesh ${meshIndex}: only triangle primitives (mode 4) are supported`);
  if (prim.attributes.POSITION === undefined) die(`mesh ${meshIndex}: primitive has no POSITION`);
  const posAcc = readAccessor(prim.attributes.POSITION);
  if (posAcc.components !== 3 || !(posAcc.data instanceof Float32Array))
    die(`mesh ${meshIndex}: POSITION must be float VEC3`);
  const positions = new Float32Array(posAcc.data.length);
  for (let i = 0; i < posAcc.data.length; i += 3) {
    const [x, y, z] = xformPoint(world, posAcc.data[i], posAcc.data[i + 1], posAcc.data[i + 2]);
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
  }
  const vertexCount = positions.length / 3;
  let triIndices;
  if (prim.indices !== undefined) {
    const idx = readAccessor(prim.indices);
    if (idx.components !== 1) die(`mesh ${meshIndex}: indices must be SCALAR`);
    triIndices = idx.data;
  } else {
    triIndices = Uint32Array.from({ length: vertexCount }, (_, i) => i);
  }
  if (triIndices.length % 3 !== 0) die(`mesh ${meshIndex}: index count is not a multiple of 3`);
  let normals;
  if (prim.attributes.NORMAL !== undefined) {
    const nAcc = readAccessor(prim.attributes.NORMAL);
    if (nAcc.components !== 3 || !(nAcc.data instanceof Float32Array))
      die(`mesh ${meshIndex}: NORMAL must be float VEC3`);
    normals = new Float32Array(nAcc.data.length);
    for (let i = 0; i < nAcc.data.length; i += 3) {
      const [x, y, z] = xformNormal(world, nAcc.data[i], nAcc.data[i + 1], nAcc.data[i + 2]);
      normals[i] = x;
      normals[i + 1] = y;
      normals[i + 2] = z;
    }
  } else {
    normals = computeNormals(positions, triIndices);
  }
  if (prim.attributes.TEXCOORD_0 !== undefined && hasEmbeddedImages()) {
    const mname = meshName ?? `mesh ${meshIndex}`;
    die(`${mname}: textures are only supported for single-mesh models`);
  }
  if (prim.attributes.TEXCOORD_0 !== undefined && !warnedUVs) {
    warnedUVs = true;
    console.warn("glb-to-usdz: UVs present but no embedded image; emitting untextured materials");
  }
  const mat = materialOf(meshIndex, prim);
  const pbr = mat.pbrMetallicRoughness ?? {};
  const baseColor = pbr.baseColorFactor ?? [1, 1, 1, 1];
  if (prim.attributes.COLOR_0 !== undefined) {
    const cAcc = readAccessor(prim.attributes.COLOR_0);
    if (!(cAcc.data instanceof Float32Array) || (cAcc.components !== 3 && cAcc.components !== 4))
      die(`mesh ${meshIndex}: COLOR_0 must be float VEC3/VEC4`);
    // Flat-shaded parts: collapse vertex colors to their mean for one material.
    let r = 0,
      g = 0,
      b = 0;
    const n = cAcc.data.length / cAcc.components;
    for (let i = 0; i < cAcc.data.length; i += cAcc.components) {
      r += cAcc.data[i];
      g += cAcc.data[i + 1];
      b += cAcc.data[i + 2];
    }
    baseColor[0] = r / n;
    baseColor[1] = g / n;
    baseColor[2] = b / n;
  }
  parts.push({
    name: meshName,
    positions,
    normals,
    triIndices,
    baseColor: [baseColor[0], baseColor[1], baseColor[2]],
    metallic: pbr.metallicFactor ?? 0,
    roughness: pbr.roughnessFactor ?? 1,
    doubleSided: mat.doubleSided ? 1 : 0,
  });
};

const nodes = gltf.nodes ?? [];
const scene = (gltf.scenes ?? [])[gltf.scene ?? 0];
if (!scene) die("glTF has no default scene");
const walk = (nodeIndex, parent) => {
  const node = nodes[nodeIndex];
  if (!node) die(`missing node ${nodeIndex}`);
  const world = mat4Mul(parent, nodeLocal(node));
  if (node.mesh !== undefined) {
    const mesh = (gltf.meshes ?? [])[node.mesh];
    if (!mesh) die(`missing mesh ${node.mesh}`);
    for (const prim of mesh.primitives)
      bakePrimitive(node.mesh, mesh.name ?? `mesh_${node.mesh}`, prim, world);
  }
  for (const child of node.children ?? []) walk(child, world);
};
for (const root of scene.nodes ?? []) walk(root, mat4Identity());
if (parts.length === 0) die("no mesh geometry found in the default scene");

/* ---------- legacy single-texture path (property.glb) ---------- */

const singleTextured =
  parts.length === 1 &&
  (gltf.meshes ?? [])[0]?.primitives?.length === 1 &&
  (gltf.meshes[0].primitives[0].attributes.TEXCOORD_0 !== undefined ||
    gltf.images?.[0]?.bufferView !== undefined);

let hasTexture = false;
let textureBytes = null;
let legacyUvs = null;
if (singleTextured) {
  const prim = gltf.meshes[0].primitives[0];
  const image = gltf.images?.[0];
  hasTexture = Boolean(
    prim.attributes.TEXCOORD_0 !== undefined && image && image.bufferView !== undefined,
  );
  if (hasTexture) {
    legacyUvs = readAccessor(prim.attributes.TEXCOORD_0).data;
    const bv = gltf.bufferViews[image.bufferView];
    textureBytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  } else if (prim.attributes.TEXCOORD_0 !== undefined) {
    console.warn("glb-to-usdz: UVs present but no embedded image; emitting untextured material");
  }
}

/* ---------- shared bounds + scale to real-world size ---------- */

const gmin = [Infinity, Infinity, Infinity];
const gmax = [-Infinity, -Infinity, -Infinity];
for (const p of parts) {
  for (let i = 0; i < p.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = p.positions[i + axis];
      if (v < gmin[axis]) gmin[axis] = v;
      if (v > gmax[axis]) gmax[axis] = v;
    }
  }
}
const footprint = Math.max(gmax[0] - gmin[0], gmax[2] - gmin[2]) || 1;
const scale = targetSize / footprint;
// Sit the model on the ground plane and centre its footprint over the anchor.
const offset = [-(gmin[0] + gmax[0]) / 2, -gmin[1], -(gmin[2] + gmax[2]) / 2];

/* ---------- emit USDA ---------- */

const list3 = (arr) => {
  const out = [];
  for (let i = 0; i < arr.length; i += 3)
    out.push(`(${f(arr[i])}, ${f(arr[i + 1])}, ${f(arr[i + 2])})`);
  return out.join(", ");
};

// Dedupe flat materials so an 80-mesh island needs only a handful.
const matIndex = new Map();
const materials = [];
for (const p of parts) {
  const key = [
    ...p.baseColor.map((c) => c.toFixed(4)),
    p.metallic,
    p.roughness,
    p.doubleSided,
  ].join("|");
  if (!matIndex.has(key)) {
    matIndex.set(key, materials.length);
    materials.push(p);
  }
  p.matId = matIndex.get(key);
}

let totalVerts = 0;
let totalTris = 0;
const meshDefs = parts.map((p, i) => {
  totalVerts += p.positions.length / 3;
  totalTris += p.triIndices.length / 3;
  const pmin = [Infinity, Infinity, Infinity];
  const pmax = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.positions.length; k += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = p.positions[k + axis];
      if (v < pmin[axis]) pmin[axis] = v;
      if (v > pmax[axis]) pmax[axis] = v;
    }
  }
  const stAttr =
    singleTextured && legacyUvs
      ? (() => {
          const st = [];
          for (let k = 0; k < legacyUvs.length; k += 2)
            st.push(`(${f(legacyUvs[k])}, ${f(1 - legacyUvs[k + 1])})`); // glTF UV origin is top-left, USD bottom-left
          return `        texCoord2f[] primvars:st = [${st.join(", ")}] (\n            interpolation = "vertex"\n        )\n`;
        })()
      : "";
  return `    def Mesh "Geometry_${i}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        uniform bool doubleSided = ${p.doubleSided}
        float3[] extent = [(${f(pmin[0])}, ${f(pmin[1])}, ${f(pmin[2])}), (${f(pmax[0])}, ${f(pmax[1])}, ${f(pmax[2])})]
        int[] faceVertexCounts = [${new Array(p.triIndices.length / 3).fill(3).join(", ")}]
        int[] faceVertexIndices = [${[...p.triIndices].join(", ")}]
        normal3f[] normals = [${list3(p.normals)}] (
            interpolation = "vertex"
        )
        point3f[] points = [${list3(p.positions)}]
${stAttr}        rel material:binding = </Root/Materials/Material_${p.matId}>
        uniform token subdivisionScheme = "none"
    }`;
});

const materialDefs = materials.map((p, i) => {
  const diffuse =
    singleTextured && hasTexture && i === 0
      ? `color3f inputs:diffuseColor.connect = </Root/Materials/Material_0/Texture.outputs:rgb>`
      : `color3f inputs:diffuseColor = (${f(p.baseColor[0])}, ${f(p.baseColor[1])}, ${f(p.baseColor[2])})`;
  const textureShaders =
    singleTextured && hasTexture && i === 0
      ? `
            def Shader "UvReader"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname = "st"
                float2 outputs:result
            }

            def Shader "Texture"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @textures/Texture_0.png@
                float2 inputs:st.connect = </Root/Materials/Material_0/UvReader.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "repeat"
                token inputs:wrapT = "repeat"
                float3 outputs:rgb
            }
`
      : "";
  return `        def Material "Material_${i}"
        {
            token outputs:surface.connect = </Root/Materials/Material_${i}/Surface.outputs:surface>

            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                ${diffuse}
                float inputs:metallic = ${f(p.metallic)}
                float inputs:roughness = ${f(p.roughness)}
                token outputs:surface
            }
${textureShaders}        }`;
});

const usda = `#usda 1.0
(
    customLayerData = {
        string creator = "RealSpace Explorer glb-to-usdz"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    kind = "component"
)
{
    float3 xformOp:scale = (${f(scale)}, ${f(scale)}, ${f(scale)})
    double3 xformOp:translate = (${f(offset[0] * scale)}, ${f(offset[1] * scale)}, ${f(offset[2] * scale)})
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]

${meshDefs.join("\n\n")}

    def Scope "Materials"
    {
${materialDefs.join("\n\n")}
    }
}
`;

/* ---------- package with the macOS USD tools ---------- */

const work = mkdtempSync(join(tmpdir(), "glb2usdz-"));
try {
  writeFileSync(join(work, "model.usda"), usda);
  if (singleTextured && hasTexture) {
    mkdirSync(join(work, "textures"), { recursive: true });
    writeFileSync(join(work, "textures", "Texture_0.png"), textureBytes);
  }

  const run = (cmd, cmdArgs) =>
    execFileSync(cmd, cmdArgs, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  // Binary crate keeps the USDZ small — USDZ stores its contents uncompressed.
  run("/usr/bin/usdcat", ["-o", "model.usdc", "model.usda"]);
  run("/usr/bin/usdzip", ["out.usdz", "-a", "model.usdc"]);

  let report = "";
  try {
    report = run("/usr/bin/usdchecker", ["--arkit", "out.usdz"]);
  } catch (error) {
    die(`usdchecker --arkit rejected the package:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, readFileSync(join(work, "out.usdz")));
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    [
      `in       ${inPath.replace(`${root}/`, "")} (${kb(glb.length)})`,
      `out      ${outPath.replace(`${root}/`, "")} (${kb(readFileSync(outPath).length)})`,
      `geometry ${parts.length} parts / ${totalVerts} verts / ${totalTris} tris / ${materials.length} materials${singleTextured && hasTexture ? " / 1 texture" : ""}`,
      `size     ${targetSize} m footprint (scale ${f(scale)})`,
      `arkit    usdchecker OK${report.trim() ? `\n${report.trim()}` : ""}`,
    ].join("\n"),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
