const CT = {
  5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array
};
const NC = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};

export async function loadJSON(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.json()}
export async function loadArrayBuffer(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.arrayBuffer()}

export function accessorView(gltf,bin,idx) {
  const a=gltf.accessors[idx], bv=gltf.bufferViews[a.bufferView];
  const C=CT[a.componentType], n=NC[a.type], bytes=C.BYTES_PER_ELEMENT;
  const off=(bv.byteOffset||0)+(a.byteOffset||0);
  if(bv.byteStride && bv.byteStride!==n*bytes) throw new Error('Interleaved accessors not supported by this build');
  return {array:new C(bin,off,a.count*n), accessor:a, components:n, componentType:a.componentType};
}

export async function loadGltf(baseUrl='./model/') {
  const gltf=await loadJSON(baseUrl+'base.gltf');
  const bin=await loadArrayBuffer(baseUrl+gltf.buffers[0].uri);
  return {gltf,bin,accessor:(i)=>accessorView(gltf,bin,i)};
}

export async function loadImageTexture(gl,url,{linear=true}={}) {
  const res=await fetch(url); if(!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob=await res.blob(); const bmp=await createImageBitmap(blob,{imageOrientation:'none'});
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  // SRGB8_ALPHA8 for color textures is intentionally not forced here; fragment shader gamma-decodes base color.
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bmp);
  gl.generateMipmap(gl.TEXTURE_2D);
  bmp.close();
  return tex;
}
