(() => {
  const canvas = document.getElementById("wmf");
  const ctx = canvas.getContext("2d", { alpha: true });

  const BG = "#0b0b0f";
  const FADE = "rgba(11,11,15,0.08)";

  const BASE_COUNT = 220;
  const SPEED = 0.45;
  const STEP = 0.9;
  const MAX_AGE = 950;
  const MOUSE_INFLUENCE = 0.55;

  const FIELD_SCALE = 0.0022;
  const FIELD_TIME = 0.00025;
  const DPR_CAP = 1.5;

  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let t = 0;
  let running = true;

  const mouse = { x: 0, y: 0, vx: 0, vy: 0, active: false };

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
    return nx0 * (1 - v) + nx1 * v;
  };

  const fieldAngle = (x, y, time) => {
    const n = noise2(x * FIELD_SCALE + time, y * FIELD_SCALE - time);
    const a = n * Math.PI * 2;
    return a * 0.82 + Math.sin(a * 2) * 0.08;
  };

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
    const count = Math.max(120, Math.min(360, Math.round(BASE_COUNT * (area / (1100 * 700)))));

    particles = Array.from({ length: count }, () => makeParticle(true));
  };

  const rand = (a, b) => a + Math.random() * (b - a);

  const makeParticle = (fresh = false) => {
    const x = fresh ? rand(0, w) : (Math.random() < 0.5 ? rand(-20, 0) : rand(w, w + 20));
    const y = fresh ? rand(0, h) : rand(0, h);
    return {
      x, y,
      px: x, py: y,
      age: Math.floor(rand(0, MAX_AGE * 0.4)),
      drift: rand(0.85, 1.15),
      width: rand(1.3, 2.2),
      hue: rand(195, 210),
      alpha: rand(0.18, 0.35),
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

      vy *= 0.82;

      if (mouse.active) {
        const dx = (mouse.x - p.x);
        const dy = (mouse.y - p.y);
        const dist2 = dx * dx + dy * dy + 12000;
        const pull = MOUSE_INFLUENCE / dist2;
        vx += dx * pull + mouse.vx * 0.0008;
        vy += dy * pull + mouse.vy * 0.0008;
      }

      const mag = Math.hypot(vx, vy) || 1;
      vx /= mag;
      vy /= mag;

      p.x += vx * SPEED * p.drift * STEP;
      p.y += vy * SPEED * p.drift * STEP;

      draw(p);

      p.age++;
      const out = (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40);
      if (out || p.age > MAX_AGE) particles[i] = makeParticle(false);
    }

    requestAnimationFrame(step);
  };

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

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(step);
  });

  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(step);
})();
