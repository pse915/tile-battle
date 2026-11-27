// 예전 게임(직접 만든 Three.js 장면)에 그래픽 개선을 붙이는 도우미 (toon: true면 카툰 모드)
//   환경 반사광(RoomEnvironment, 외부 파일 없음) + 높음 품질에서 빛 번짐 후처리
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** @returns 후처리 composer (낮음이면 null) */
export function applyGfx(renderer, scene, camera, { high, env = true, bloom = 0.2, threshold = 0.9, toon = false }) {
  if (toon) {
    // 카툰: 반사광·후처리 없이 또렷하게 (툰 재질·외곽선은 shared/table3d.js의 toonMat, addOutline)
    scene.environment = null;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return null;
  }
  if (env) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  if (!high) return null;
  const c = new EffectComposer(renderer);
  c.addPass(new RenderPass(scene, camera));
  c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, 0.45, threshold));
  c.addPass(new OutputPass());
  return c;
}
