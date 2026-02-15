(() => {
  const canvas = document.getElementById("wmf");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  let t = 0;
  function loop() {
    t += 0.02;
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x = canvas.width * (0.5 + 0.35 * Math.cos(t));
    const y = canvas.height * (0.5 + 0.35 * Math.sin(t));

    ctx.fillStyle = "rgba(255,80,80,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(loop);
  }
  loop();
})();
