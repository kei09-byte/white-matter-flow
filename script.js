(() => {
  const canvas = document.getElementById("wmf");
  const ctx = canvas.getContext("2d", { alpha: true });

  // ---- Look & Feel ----
  const BG = "#0b0b0f";
  const FADE = "rgba(11,11,15,0.055)"; // 残像：小さいほど長く残る

  // ---- Particles ----
  const BASE_COUNT = 230;
  const SPEED = 0.46;       // 静かさ（小さいほどゆっくり）
  const STEP = 1.0;
  const MAX_AGE = 980;

  // マウス影響は“ほんの少し”
  const MOUSE_INFLUENCE = 0.45;

  // ---- Flow field ----
  const FIELD_SCALE = 0.0021;
  const FIELD_TIME = 0.00025;

  // ---- DPR ----
  const DPR_CAP = 1.5;

  // ---- Callosal bias（脳梁っぽい主方向）----
  // 中央付近に「左右へ流れる帯」を作り、上下に行くほど弓なりに曲げる
  const CALLOSAL_STRENGTH = 0.85; // 0.0〜1.2（強すぎると人工的）
  const CALLOSAL_Y = 0.50;        // 画面内の脳梁位置（0=上, 1=下）
  const CALLOSAL_BAND = 0.22;     // 帯の太さ（大きいほど広い）
  const CALLOSAL_ARC = 0.70;      // 弓なり量（0=直線、上げると弓なり）
  const HORIZ_LOCK = 0.65;        // 水平への寄せ具合（0〜1）

  // ---- State ----
  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let t = 0;
  let running = true;

  const mouse = { x: 0, y: 0, vx: 0, vy: 0, active: false };

  // ---- Tiny noise helpers (lightweight value noise) ----
  const hash = (x, y) => {
    let n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  };

  const smoothstep = (a) => a * a * (3 - 2 * a);

  const noise2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smoothstep(xf), v = smoothstep(yf);
    const n00 = hash(xi, yi);
    const n10 = hash(xi + 1, yi);
    const n01 = hash(xi, yi + 1);
    const n11 = hash(xi + 1, yi + 1);
    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    return nx0 * (1 - v) + nx1 * v; // 0..1
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---- Callosal-biased field angle ----
  const fieldAngle = (x, y, time) => {
    // Base noise angle
    const n = noise2(x * FIELD_SCALE + time, y * FIELD_SCALE - time);
    const aNoise = (n * Math.PI * 2) * 0.82 + Math.sin(n * Math.PI * 4) * 0.08;

    // Callosal band (Gaussian around CALLOSAL_Y)
    const yn = h > 0 ? (y / h) : 0.5;
    const dy = (yn - CALLOSAL_Y) / CALLOSAL_BAND; // normalized distance from band center
    const band = Math.exp(-dy * dy);              // 0..1 (center=1)

    // Horizontal primary direction (left-right) + arc
    const xn = w > 0 ? ((x / w) - 0.5) : 0;      // -0.5..0.5
    // Arc increases away from the band center and flips subtly across midline
    const arc = Math.atan2(dy * 0.95, 1.0) * CALLOSAL_ARC; // [-..+]
    // Make the band mostly horizontal (0 rad = rightwards, PI = leftwards)
    const aHoriz = (xn >= 0 ? 0 : Math.PI);
    const aCallosal = aHoriz + arc;

    // Mix: more callosal near band, less away from band
    // "mixW" becomes strong near band; also a bit of horizontal lock
    const mixW = clamp01(CALLOSAL_STRENGTH * band);
    let aMixed = aNoise * (1 - mixW) + aCallosal * mixW;

    // Extra gentle horizontal locking near band (keeps CC feeling)
    const lockW = clamp01(band * HORIZ_LOCK);
    const aLocked = aHoriz + arc * 0.6; // lock target (still slightly curved)
    aMixed = aMixed * (1 - lockW) + aLocked * lockW;

    return aMixed;
  };

  // ---- Resize & init ----
  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const area = w * h;
    const count = Math.max(140, Math.min(420, Math.round(BASE_COUNT * (area / (1100 * 700)))));

    particles = Array.from({ length: count }, () => makeParticle(true));
  };

  const makeParticle = (fresh = false) => {
    // fresh: anywhere; otherwise spawn from sides for flow feel
    const x = fresh ? rand(0, w) : (Math.random() < 0.5 ? rand(-30, 0) : rand(w, w + 30));
    const y = fresh ? rand(0, h) : rand(0, h);
    return {
      x, y,
      px: x, py: y,
      age: Math.floor(rand(0, MAX_AGE * 0.4)),
      drift: rand(0.86, 1.18),
      // 見えるけど上品な範囲
      width: rand(1.05, 1.75),
      hue: rand(195, 214),
      alpha: rand(0.10, 0.20),
    };
  };

  const fade = () => {
    ctx.fillStyle = FADE;
    ctx.fillRect(0, 0, w, h);
  };

  const draw = (p) => {
    ctx.lineWidth = p.width;
    ctx.strokeStyle = `hsla(${p.hue}, 55%, 92%, ${p.alpha})`;
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  // ---- Animation ----
  const step = () => {
    if (!running) return;

    t += FIELD_TIME;
    fade();

    mouse.vx *= 0.90;
    mouse.vy *= 0.90;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      p.px = p.x;
      p.py = p.y;

      const a = fieldAngle(p.x, p.y, t);

      let vx = Math.cos(a);
      let vy = Math.sin(a);

      // Slight “bundle” feel: suppress vertical a bit
      vy *= 0.78;

      // Gentle mouse curvature
      if (mouse.active) {
        const dx = (mouse.x - p.x);
        const dy = (mouse.y - p.y);
        const dist2 = dx * dx + dy * dy + 14000;
        const pull = MOUSE_INFLUENCE / dist2;
        vx += dx * pull + mouse.vx * 0.0007;
        vy += dy * pull + mouse.vy * 0.0007;
      }

      // Normalize
      const mag = Math.hypot(vx, vy) || 1;
      vx /= mag;
      vy /= mag;

      p.x += vx * SPEED * p.drift * STEP;
      p.y += vy * SPEED * p.drift * STEP;

      draw(p);

      p.age++;
      const out = (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60);
      if (out || p.age > MAX_AGE) particles[i] = makeParticle(false);
    }

    requestAnimationFrame(step);
  };

  // ---- Input ----
  const onMove = (clientX, clientY, dx, dy) => {
    mouse.active = true;
    mouse.x = clientX;
    mouse.y = clientY;
    mouse.vx = dx;
    mouse.vy = dy;
  };

  let lastX = 0, lastY = 0, hasLast = false;

  window.addEventListener("mousemove", (e) => {
    if (!hasLast) { lastX = e.clientX; lastY = e.clientY; hasLast = true; }
    onMove(e.clientX, e.clientY, e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t0 = e.touches[0];
    if (!t0) return;
    if (!hasLast) { lastX = t0.clientX; lastY = t0.clientY; hasLast = true; }
    onMove(t0.clientX, t0.clientY, t0.clientX - lastX, t0.clientY - lastY);
    lastX = t0.clientX; lastY = t0.clientY;
  }, { passive: true });

  window.addEventListener("mouseleave", () => { mouse.active = false; }, { passive: true });

  // ---- Perf / visibility ----
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(step);
  });

  window.addEventListener("resize", resize);

  // ---- Start ----
  resize();
  requestAnimationFrame(step);
})();
