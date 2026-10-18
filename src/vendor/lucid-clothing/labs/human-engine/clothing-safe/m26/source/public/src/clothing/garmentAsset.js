
import {loadJSON} from '../runtime/loader.js';

function decodeBase64(s,Type){
  const raw=atob(s),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const aligned=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return new Type(aligned);
}
function decodeOptional(a,key,Type){
  return a[key]?decodeBase64(a[key],Type):null;
}
export function decodeGarmentAsset(data){
  const a=data.arrays;
  return {
    meta:data,
    positions:decodeBase64(a.positions_f32_b64,Float32Array),
    colors:decodeBase64(a.colors_f32_b64,Float32Array),
    indices:decodeBase64(a.indices_u32_b64,Uint32Array),
    edges:decodeBase64(a.edges_u32_b64,Uint32Array),
    bends:decodeBase64(a.bends_u32_b64,Uint32Array),
    seams:decodeBase64(a.seams_u32_b64,Uint32Array),
    componentIds:decodeBase64(a.component_ids_i16_b64,Int16Array),
    uvs:decodeOptional(a,'uvs_f32_b64',Float32Array),
    vertexThicknessScale:decodeOptional(a,'vertex_thickness_scale_f32_b64',Float32Array),
    vertexSkinFrictionStatic:decodeOptional(a,'vertex_skin_friction_static_f32_b64',Float32Array),
    vertexSkinFrictionDynamic:decodeOptional(a,'vertex_skin_friction_dynamic_f32_b64',Float32Array),
    vertexWrinkleAmplitude:decodeOptional(a,'vertex_wrinkle_amplitude_f32_b64',Float32Array),
    vertexCreaseBias:decodeOptional(a,'vertex_crease_bias_f32_b64',Float32Array),
    vertexBendScale:decodeOptional(a,'vertex_bend_scale_f32_b64',Float32Array),
    vertexStretchScale:decodeOptional(a,'vertex_stretch_scale_f32_b64',Float32Array),
    vertexDampingScale:decodeOptional(a,'vertex_damping_scale_f32_b64',Float32Array),
    vertexDirectionAngle:decodeOptional(a,'vertex_direction_angle_f32_b64',Float32Array),
    edgeStiffnessScale:decodeOptional(a,'edge_stiffness_scale_f32_b64',Float32Array),
    edgeRestScale:decodeOptional(a,'edge_rest_scale_f32_b64',Float32Array),
    bendStiffnessScale:decodeOptional(a,'bend_stiffness_scale_f32_b64',Float32Array),
    bendRestScale:decodeOptional(a,'bend_rest_scale_f32_b64',Float32Array)
  };
}
export async function loadGarmentAsset(url='./data/clothing/lucid_human_native_tshirt_v1.json'){
  return decodeGarmentAsset(await loadJSON(url));
}
