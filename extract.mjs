import fs from 'fs';

const path = 'client/assets/models/collision.gltf';
const gltf = JSON.parse(fs.readFileSync(path, 'utf8'));

if (gltf.images) gltf.images = [];
if (gltf.textures) gltf.textures = [];
if (gltf.samplers) gltf.samplers = [];
if (gltf.materials) {
  gltf.materials.forEach(mat => {
    delete mat.pbrMetallicRoughness?.baseColorTexture;
    delete mat.normalTexture;
    delete mat.occlusionTexture;
    delete mat.emissiveTexture;
  });
}

fs.writeFileSync(path, JSON.stringify(gltf));
console.log('collision textures stripped');
