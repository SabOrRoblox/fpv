import * as THREE from 'three';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function detectLowEnd(canvas) {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 2) return true;

  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return /Adreno [1-5]\d\d|Mali-T[0-9]|Mali-4|Mali-G[1-3][0-9]|PowerVR|SGX|VideoCore/i.test(renderer);
  } catch {
    return false;
  }
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    const lowEnd = isMobile && detectLowEnd(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      precision: 'mediump',
      stencil: false,
      depth: true,
      alpha: false,
    });

    const dpr = lowEnd
      ? 1.0
      : isMobile
        ? Math.min(window.devicePixelRatio, 1.5)
        : Math.min(window.devicePixelRatio, 2);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a9c9);
    this.scene.fog = new THREE.Fog(0x87a9c9, 300, 2000);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 5000);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1.0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(200, 400, 150);
    this.scene.add(sun);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}