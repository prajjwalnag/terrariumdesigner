import * as THREE from 'three';
import { ventLayout, ventBlockedByCamera } from './calc.js';
import { buildToy, toyPlacement, toySizeMm } from './toys.js';
import { MM_PER_IN } from './format.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, ...o });
const M = {
  acrylic: mat(0xbfe6f5, { transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  edge: new THREE.LineBasicMaterial({ color: 0x4f9dbd, transparent: true, opacity: 0.75 }),
  bracket: mat(0xe8743b, { roughness: 0.55, metalness: 0.05 }),
  magnet: mat(0xd9b44a, { roughness: 0.25, metalness: 0.85 }),
  vent: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  spider: mat(0x8a5a35, { roughness: 0.8 }),
  substrate: mat(0x5a3e28, { roughness: 1 }),
  bark: mat(0xb07a40, { roughness: 0.9, side: THREE.DoubleSide }),
  water: mat(0x4aa3d8, { roughness: 0.2 }),
  plant: mat(0x4c9a3a, { roughness: 0.8 }),
  pcb: mat(0x1f6b3a, { roughness: 0.6 }),
  metal: mat(0xb8bcc2, { roughness: 0.3, metalness: 0.8 }),
  black: mat(0x222222, { roughness: 0.5 }),
  lens: new THREE.MeshBasicMaterial({ color: 0x3a5fa8 }),
  toy: mat(0x6fb39a, { roughness: 0.55 }),
  frustum: new THREE.LineBasicMaterial({ color: 0x1d9e75, transparent: true, opacity: 0.9 }),
};

function box(w, h, d, x, y, z, material, parent, edges) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  if (edges) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
    e.position.copy(mesh.position);
    parent.add(e);
  }
  return mesh;
}

function leg(a, b, radius, parent) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), M.spider);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  parent.add(m);
}

/** ESP32-CAM board with its lens, hanging below `parent`'s origin (the plate underside). */
function cameraModule(parent, plateT, extra) {
  const g = new THREE.Group();
  parent.add(g);
  box(1.3, 0.1, 1.8, 0, 0.05, 0.3, M.bracket, g, false);
  box(1.06, 0.06, 1.6, 0, 0.13, 0.3, M.pcb, g, false);
  box(0.55, 0.08, 0.6, 0, 0.2, 0.7, M.metal, g, false);
  box(0.34, 0.3, 0.34, 0, 0.31, 0, M.black, g, false);
  const len = plateT + 0.05 + extra;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len + 0.3, 16), M.black);
  barrel.position.set(0, (0.3 - len) / 2, 0);
  g.add(barrel);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), M.lens);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -len - 0.001, 0);
  g.add(lens);
  return g;
}

function makeLogoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const placeholder = () => {
    ctx.clearRect(0, 0, 512, 512);
    ctx.strokeStyle = ctx.fillStyle = '#D85A30';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(256, 220, 150, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(256, 235, 28, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(256, 190, 18, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 7;
    [-1, 1].forEach((side) => {
      [[-60, -40, -95, -10], [-70, -5, -110, 25], [-70, 25, -105, 65], [-55, 50, -80, 95]].forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(256 + side * 10, 215);
        ctx.quadraticCurveTo(256 + side * p[0], 215 + p[1] - 30, 256 + side * p[2], 215 + p[3] + 10);
        ctx.stroke();
      });
    });
    ctx.font = '500 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOUR LOGO', 256, 450);
    tex.needsUpdate = true;
  };
  placeholder();
  const set = (dataUrl) => {
    if (!dataUrl) return placeholder();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 512, 512);
      const k = Math.min(500 / img.width, 500 / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h);
      tex.needsUpdate = true;
    };
    img.src = dataUrl;
  };
  return { tex, set };
}

const VIEWS = {
  iso: { th: 0.75, ph: 1.15 },
  front: { th: 0, ph: 1.5 },
  side: { th: Math.PI / 2, ph: 1.5 },
  top: { th: 0, ph: 0.06 },
};

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(6, 10, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-8, 4, -6);
  scene.add(fill);

  const logo = makeLogoTexture();
  const logoMat = new THREE.MeshBasicMaterial({ map: logo.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });

  const orbit = { th: 0.75, ph: 1.15, dist: 14, ty: 2, drag: false, lx: 0, ly: 0, minD: 4, maxD: 80, goal: null };
  let root = null;
  let lid = null;
  let frustum = null;
  let current = null; // { s, g }
  let sizeKey = '';
  let auto = true;
  let visible = true;

  function resize() {
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function applyLift(s = current && current.s) {
    if (!lid || !s) return;
    const { g } = current;
    lid.position.set(0, g.H + g.t / 2 + s.lift * Math.max(2.2, g.H * 0.55), 0);
    if (frustum) frustum.visible = s.cpos === 'side' || s.lift < 0.02;
  }

  function disposeRoot() {
    if (!root) return;
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(root);
  }

  function rebuild(s, g) {
    current = { s, g };
    disposeRoot();
    root = new THREE.Group();
    scene.add(root);
    frustum = null;
    const { W, D, H, t, hw, sd, free, L, m0, fy } = g;

    // Acrylic shell
    box(W, t, D, 0, t / 2, 0, M.acrylic, root, true); // base
    box(W, hw, t, 0, t + hw / 2, D / 2 - t / 2, M.acrylic, root, true); // front
    box(W, hw, t, 0, t + hw / 2, -(D / 2 - t / 2), M.acrylic, root, true); // back
    box(t, hw, D - 2 * t, W / 2 - t / 2, t + hw / 2, 0, M.acrylic, root, true); // right
    box(t, hw, D - 2 * t, -(W / 2 - t / 2), t + hw / 2, 0, M.acrylic, root, true); // left
    lid = new THREE.Group();
    root.add(lid);
    box(W, t, D, 0, 0, 0, M.acrylic, lid, true);

    // Corner brackets with magnets
    const arm = g.arm;
    const th = 0.1; // bracket wall thickness
    const legH = Math.min(arm * 1.1, hw * 0.5);
    const pad = arm * 0.6;
    const magR = Math.min(0.15, pad * 0.32);
    const magInset = pad * 0.5;
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      box(arm, legH, th, sx * (W / 2 + th - arm / 2), H - legH / 2, sz * (D / 2 + th / 2), M.bracket, root, false);
      box(th, legH, arm, sx * (W / 2 + th / 2), H - legH / 2, sz * (D / 2 + th - arm / 2), M.bracket, root, false);
      const foot = pad + t + th;
      box(foot, 0.1, foot, sx * ((W / 2 - t - pad + (W / 2 + th)) / 2), H - 0.05, sz * ((D / 2 - t - pad + (D / 2 + th)) / 2), M.bracket, root, false);
      const mx = sx * (W / 2 - t - magInset);
      const mz = sz * (D / 2 - t - magInset);
      const disc = new THREE.CylinderGeometry(magR, magR, 0.07, 20);
      const top = new THREE.Mesh(disc, M.magnet);
      top.position.set(mx, H - 0.01, mz);
      root.add(top);
      const bottom = new THREE.Mesh(disc, M.magnet);
      bottom.position.set(mx, -t / 2 + 0.03, mz);
      lid.add(bottom);
    }));

    // Camera hardware
    const cam = g.cam;
    if (cam && cam.mode === 'top') {
      const c = cameraModule(lid, t, 0);
      c.position.set(0, t / 2, 0);
      c.scale.set(cam.sc, 1, cam.sc);
    }
    if (cam && cam.mode === 'side') {
      const c = cameraModule(root, t, 0);
      c.position.set(W / 2, g.camY, 0);
      c.rotation.z = -Math.PI / 2;
      c.scale.set(cam.s, 1, cam.s);
    }
    if (cam && cam.mode === 'corner') {
      const holder = new THREE.Group();
      holder.position.set(cam.px, t / 2, cam.pz);
      holder.rotation.y = Math.atan2(-cam.uz, cam.ux);
      lid.add(holder);
      const tilt = new THREE.Group();
      tilt.rotation.z = cam.al;
      tilt.position.y = cam.lft;
      holder.add(tilt);
      cameraModule(tilt, t, cam.ext);
      const wedge = new THREE.Shape();
      wedge.moveTo(-0.65 * Math.cos(cam.al), 0);
      wedge.lineTo(0.65 * Math.cos(cam.al), 0);
      wedge.lineTo(0.65 * Math.cos(cam.al), 1.3 * Math.sin(cam.al));
      wedge.closePath();
      const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wedge, { depth: 1.8, bevelEnabled: false }), M.bracket);
      w.position.z = -0.6;
      holder.add(w);
    }

    // Vent holes
    if (s.vents) {
      const v = ventLayout(g);
      const disc = new THREE.CircleGeometry(0.06, 12);
      v.ys.forEach((y) => {
        v.zs.forEach((z) => {
          if (!ventBlockedByCamera(s, g, z, y)) {
            const r = new THREE.Mesh(disc, M.vent);
            r.rotation.y = Math.PI / 2;
            r.position.set(W / 2 - t / 2, y, z);
            root.add(r);
          }
          const l = new THREE.Mesh(disc, M.vent);
          l.rotation.y = Math.PI / 2;
          l.position.set(-(W / 2 - t / 2), y, z);
          root.add(l);
        });
        v.xs.forEach((x) => {
          const b = new THREE.Mesh(disc, M.vent);
          b.position.set(x, y, -(D / 2 - t / 2));
          root.add(b);
        });
      });
    }

    // Logo on the front panel
    if (s.logo) {
      const size = Math.min(W * 0.5, hw * 0.6);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), logoMat);
      p.position.set(0, t + hw * 0.45, D / 2 + 0.004);
      root.add(p);
    }

    // Terrarium set-up
    if (s.decor) {
      box(W - 2 * t, sd, D - 2 * t, 0, t + sd / 2, 0, M.substrate, root, false);
      const top = t + sd;
      const hide = Math.max(0.4, Math.min(L * 0.5, m0 * 0.2, free * 0.6));
      if (s.type === 'terr') {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(hide, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.bark);
        dome.scale.y = 0.8;
        dome.position.set(-(W / 2 - t - hide - 0.2), top, -(D / 2 - t - hide - 0.2));
        root.add(dome);
      } else {
        const r = Math.max(0.25, Math.min(0.4, m0 * 0.1));
        const hgt = Math.max(1, free * 0.85);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 14), M.bark);
        trunk.position.set(-(W / 2 - t - r - 0.15), top + hgt / 2, -(D / 2 - t - r - 0.15));
        root.add(trunk);
      }
      const dish = Math.max(0.25, Math.min(0.5, m0 * 0.1));
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(dish, dish, 0.16, 20), M.water);
      bowl.position.set(W / 2 - t - dish - 0.15, top + 0.08, D / 2 - t - dish - 0.15);
      root.add(bowl);
      const bladeH = Math.max(0.5, Math.min(1.3, free * 0.5));
      [[0, 0, 1], [0.22, 0.12, 0.75], [-0.2, 0.1, 0.6]].forEach(([dx, dz, k]) => {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16, bladeH * k, 8), M.plant);
        blade.position.set(W / 2 - t - 0.45 + dx, top + (bladeH * k) / 2, -(D / 2 - t - 0.45) + dz);
        root.add(blade);
      });
    }

    // Printed toys
    (s.toys || []).forEach((toy) => {
      const p = toyPlacement(toy, g);
      const grp = buildToy(toy.kind, toySizeMm(toy, g.L), M.toy);
      grp.scale.setScalar(1 / MM_PER_IN);
      grp.rotation.y = (toy.rot * Math.PI) / 180;
      grp.position.set(p.x, g.fy - 0.01, p.z);
      root.add(grp);
    });

    // Spider
    if (s.spider) {
      const k = L / 1.3;
      const r = Math.max(0.022 * k, 0.025);
      const sp = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * k, 14, 12), M.spider);
      head.position.set(0, 0.2 * k, 0.18 * k);
      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.26 * k, 14, 12), M.spider);
      abdomen.position.set(0, 0.24 * k, -0.15 * k);
      sp.add(head, abdomen);
      [-1, 1].forEach((side) => {
        [0.28, 0.1, -0.08, -0.26].forEach((z, i) => {
          const a = new THREE.Vector3(side * 0.1 * k, 0.2 * k, (z + 0.05) * k);
          const b = new THREE.Vector3(side * 0.42 * k, 0.34 * k, (z + 0.12 - i * 0.03) * k);
          const c = new THREE.Vector3(side * 0.65 * k, 0, (z + 0.2 - i * 0.06) * k);
          leg(a, b, r, sp);
          leg(b, c, r * 0.9, sp);
        });
      });
      if (s.type === 'terr') {
        sp.position.set(-W * 0.06, t + sd, D * 0.1);
        sp.rotation.y = 0.5;
      } else {
        sp.rotation.x = Math.PI / 2;
        sp.position.set(W * 0.1, t + sd + free * 0.5, -(D / 2 - t) + 0.01);
      }
      root.add(sp);
    }

    // Camera field-of-view overlay
    if (s.cam && s.camview && cam && cam.C && cam.pts) {
      frustum = new THREE.Group();
      root.add(frustum);
      frustum.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(cam.pts), M.frustum));
      const rays = [];
      cam.pts.forEach((p) => rays.push(cam.C.clone(), p.clone()));
      frustum.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rays), M.frustum));
    }

    applyLift(s);

    // Re-frame only when the box itself changes size, so zooming survives slider drags.
    const k = `${W}|${D}|${H}`;
    if (k !== sizeKey) {
      sizeKey = k;
      orbit.dist = Math.max(W, D, H) * 2.5 + 3;
      orbit.ty = H * 0.45;
    }
    auto = s.auto;
  }

  // --- interaction ---
  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    orbit.goal = null;
    orbit.drag = true;
    orbit.lx = e.clientX;
    orbit.ly = e.clientY;
    canvas.style.cursor = 'grabbing';
    if (pointers.size === 2) pinch = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomBy(pinch / d);
      pinch = d;
      return;
    }
    orbit.th -= (e.clientX - orbit.lx) * 0.01;
    orbit.ph = Math.min(1.57, Math.max(0.05, orbit.ph - (e.clientY - orbit.ly) * 0.008));
    orbit.lx = e.clientX;
    orbit.ly = e.clientY;
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!pointers.size) { orbit.drag = false; canvas.style.cursor = 'grab'; }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const zoomBy = (f) => { orbit.dist = Math.min(orbit.maxD, Math.max(orbit.minD, orbit.dist * f)); };
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(Math.exp(e.deltaY * 0.001));
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 0.12;
    const map = {
      ArrowLeft: () => { orbit.th += step; }, ArrowRight: () => { orbit.th -= step; },
      ArrowUp: () => { orbit.ph = Math.max(0.05, orbit.ph - step); }, ArrowDown: () => { orbit.ph = Math.min(1.57, orbit.ph + step); },
      '+': () => zoomBy(0.9), '=': () => zoomBy(0.9), '-': () => zoomBy(1.1),
    };
    if (map[e.key]) { e.preventDefault(); orbit.goal = null; map[e.key](); }
  });

  function setView(name) {
    const v = VIEWS[name];
    if (!v) return;
    // take the shortest way round
    const turn = Math.round((orbit.th - v.th) / (2 * Math.PI)) * 2 * Math.PI;
    orbit.goal = { th: v.th + turn, ph: v.ph, dist: current ? Math.max(current.g.W, current.g.D, current.g.H) * 2.5 + 3 : orbit.dist };
  }

  // --- render loop (paused when off-screen or the tab is hidden) ---
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    if (orbit.goal) {
      const k = 0.14;
      orbit.th += (orbit.goal.th - orbit.th) * k;
      orbit.ph += (orbit.goal.ph - orbit.ph) * k;
      orbit.dist += (orbit.goal.dist - orbit.dist) * k;
      if (Math.abs(orbit.goal.th - orbit.th) + Math.abs(orbit.goal.ph - orbit.ph) < 0.002) orbit.goal = null;
    } else if (auto && !orbit.drag) {
      orbit.th += 0.004;
    }
    const ty = orbit.ty;
    camera.position.set(
      orbit.dist * Math.sin(orbit.ph) * Math.sin(orbit.th),
      ty + orbit.dist * Math.cos(orbit.ph),
      orbit.dist * Math.sin(orbit.ph) * Math.cos(orbit.th),
    );
    camera.lookAt(0, ty, 0);
    renderer.render(scene, camera);
  }
  frame();

  return {
    rebuild,
    applyLift,
    setLogo: logo.set,
    setAuto: (v) => { auto = v; },
    setView,
    zoom: zoomBy,
    /** Render now and return the canvas, so the caller can export it before the buffer clears. */
    snapshot() {
      renderer.render(scene, camera);
      return canvas;
    },
  };
}
