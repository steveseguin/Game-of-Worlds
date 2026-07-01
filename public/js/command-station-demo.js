(function () {
  const STATION_WIDTH = 1575;
  const STATION_HEIGHT = 900;

  const station = document.querySelector(".station");
  const canvas = document.getElementById("spaceSensor");
  const ctx = canvas.getContext("2d");
  const reticle = document.getElementById("sensorReticle");
  const messageType = document.getElementById("messageType");
  const messageQueue = document.getElementById("messageQueue");
  const messageText = document.getElementById("messageText");
  const eventLog = document.getElementById("eventLog");
  const waveform = document.getElementById("waveform");
  const sparkLayer = document.getElementById("sparkLayer");
  const autoBtn = document.getElementById("autoCycle");
  const sensorTitle = document.getElementById("sensorTitle");
  const sensorSubline = document.getElementById("sensorSubline");
  const hazardReadout = document.getElementById("hazardReadout");

  const sensorTexture = new Image();
  sensorTexture.src = "images/command-station/sensor-map-v2.png";

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  let pointer = { x: 0.58, y: 0.52 };
  let autoCycle = true;
  let eventIndex = 0;
  let typeToken = 0;
  let canvasWidth = 1;
  let canvasHeight = 1;

  const events = {
    probeLost: {
      type: "PROBE LOSS",
      tone: "warning",
      title: "PROBE SIGNAL LOST",
      hazard: "UNKNOWN FIELD",
      subline: "Telemetry ended | Return path absent",
      line: "Probe telemetry ended in sector 19. We have signal fragments, no return path, and a widening debris signature.",
    },
    blackHole: {
      type: "GRAVITY ALERT",
      tone: "error",
      title: "BLACK-HOLE CONTACT",
      hazard: "GRAVITY WELL",
      subline: "Signal bend 91% | Fleet risk terminal",
      line: "Fleet contact lost. The sector contains a black hole. No survivors, no salvage, no second pass.",
    },
    asteroid: {
      type: "HULL DAMAGE",
      tone: "warning",
      title: "ASTEROID FIELD",
      hazard: "IMPACT BELT",
      subline: "Hull damage likely | Safe after control",
      line: "Asteroid belt traversal complete. Multiple hulls breached. Secure the field and the route becomes usable.",
    },
    colony: {
      type: "COLONY ONLINE",
      tone: "success",
      title: "COLONY BEACON",
      hazard: "CLEAR",
      subline: "Signal locked | Construction crews ready",
      line: "Colony beacon is stable. Extractors can begin work as soon as the first construction crew lands.",
    },
    battle: {
      type: "BATTLE REPORT",
      tone: "error",
      title: "WEAPONS CONTACT",
      hazard: "HOSTILE FLEET",
      subline: "Command latency unstable | Fire exchanged",
      line: "Enemy fleet engaged near the inner marker. Tactical display shows weapons fire and unstable command latency.",
    },
    research: {
      type: "RESEARCH",
      tone: "success",
      title: "LAB BREAKTHROUGH",
      hazard: "NONE",
      subline: "Scanner routines updated | Fleet package ready",
      line: "Research lab reports a breakthrough. New scanner routines are ready for fleet deployment.",
    },
  };

  const eventOrder = [
    "probeLost",
    "blackHole",
    "asteroid",
    "colony",
    "battle",
    "research",
  ];

  const stars = Array.from({ length: 130 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.2,
    p: Math.random() * Math.PI * 2,
    a: 0.22 + Math.random() * 0.42,
    c: Math.random() > 0.74 ? "255, 198, 78" : "107, 255, 199",
  }));

  const signalPings = [
    { x: 0.66, y: 0.52, tone: "255, 78, 46" },
    { x: 0.31, y: 0.28, tone: "81, 222, 255" },
    { x: 0.24, y: 0.68, tone: "117, 255, 144" },
  ];

  function resizeStation() {
    const scale = Math.min(
      window.innerWidth / STATION_WIDTH,
      window.innerHeight / STATION_HEIGHT,
    );
    document.documentElement.style.setProperty(
      "--station-scale",
      Math.max(0.1, scale).toFixed(4),
    );
  }

  function resizeCanvas() {
    const ratio = dpr();
    canvasWidth = Math.max(1, Math.floor(canvas.clientWidth));
    canvasHeight = Math.max(1, Math.floor(canvas.clientHeight));
    canvas.width = Math.floor(canvasWidth * ratio);
    canvas.height = Math.floor(canvasHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawImageCover(context, image, x, y, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (imageRatio > targetRatio) {
      sourceWidth = image.naturalHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    );
  }

  function drawFallbackBackground() {
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, "#03110f");
    gradient.addColorStop(0.52, "#061b14");
    gradient.addColorStop(1, "#130806");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  function drawGlassBloom(t) {
    const radius = Math.max(canvasWidth, canvasHeight);
    const pulse = 0.5 + Math.sin(t * 0.0009) * 0.08;
    const glow = ctx.createRadialGradient(
      canvasWidth * 0.58,
      canvasHeight * 0.5,
      0,
      canvasWidth * 0.58,
      canvasHeight * 0.5,
      radius * 0.72,
    );
    glow.addColorStop(0, `rgba(86, 255, 190, ${0.09 + pulse * 0.03})`);
    glow.addColorStop(0.46, "rgba(255, 190, 68, 0.035)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  function drawAnimatedStars(t) {
    stars.forEach((star) => {
      const flicker = 0.5 + Math.sin(t * 0.0022 + star.p) * 0.5;
      ctx.fillStyle = `rgba(${star.c}, ${star.a * flicker})`;
      ctx.beginPath();
      ctx.arc(
        star.x * canvasWidth,
        star.y * canvasHeight,
        star.r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }

  function drawPings(t) {
    signalPings.forEach((ping, index) => {
      const cycle = (t * 0.00035 + index * 0.31) % 1 || 0.001;
      const x = ping.x * canvasWidth;
      const y = ping.y * canvasHeight;
      const radius = 18 + cycle * 120;
      ctx.strokeStyle = `rgba(${ping.tone}, ${0.45 * (1 - cycle)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${ping.tone}, ${0.55 + Math.sin(t * 0.004 + index) * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFleetTrace(t) {
    const points = [
      [0.18, 0.67],
      [0.31, 0.58],
      [0.44, 0.41],
      [0.61, 0.47],
      [0.72, 0.56],
    ];

    ctx.save();
    ctx.strokeStyle = "rgba(255, 198, 78, 0.68)";
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 10]);
    ctx.lineDashOffset = -t * 0.024;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const px = x * canvasWidth;
      const py = y * canvasHeight;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    const cycle = (t * 0.00012) % 1;
    const segment = Math.min(
      points.length - 2,
      Math.floor(cycle * (points.length - 1)),
    );
    const local = cycle * (points.length - 1) - segment;
    const start = points[segment];
    const end = points[segment + 1];
    const shipX = (start[0] + (end[0] - start[0]) * local) * canvasWidth;
    const shipY = (start[1] + (end[1] - start[1]) * local) * canvasHeight;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(Math.atan2(end[1] - start[1], end[0] - start[0]));
    ctx.fillStyle = "rgba(114, 255, 190, 0.82)";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBlackHolePulse(t) {
    const cx = canvasWidth * 0.68;
    const cy = canvasHeight * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.00018);
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `rgba(255, ${86 + i * 18}, 58, ${0.3 - i * 0.036})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        36 + i * 23 + Math.sin(t * 0.002 + i) * 2,
        13 + i * 8,
        i * 0.1,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSensor(t) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (sensorTexture.complete && sensorTexture.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.88;
      drawImageCover(ctx, sensorTexture, 0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    } else {
      drawFallbackBackground();
    }

    ctx.globalCompositeOperation = "screen";
    drawGlassBloom(t);
    drawAnimatedStars(t);
    drawFleetTrace(t);
    drawPings(t);
    drawBlackHolePulse(t);
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.strokeStyle = "rgba(121, 255, 192, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      pointer.x * canvasWidth,
      pointer.y * canvasHeight,
      38 + Math.sin(t * 0.003) * 4,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();

    requestAnimationFrame(drawSensor);
  }

  function buildWaveform() {
    waveform.innerHTML = "";
    for (let i = 0; i < 18; i += 1) {
      const bar = document.createElement("span");
      bar.style.setProperty("--i", i);
      bar.style.height = `${18 + Math.random() * 66}%`;
      waveform.appendChild(bar);
    }
  }

  function setMessage(key) {
    const event = events[key] || events.probeLost;
    const token = ++typeToken;
    station.dataset.alert = event.tone;
    station.classList.add("is-talking");
    messageType.textContent = event.type;
    messageQueue.textContent = `QUEUE ${String((eventIndex % 9) + 1).padStart(2, "0")}`;
    sensorTitle.textContent = event.title;
    sensorSubline.textContent = event.subline;
    hazardReadout.textContent = event.hazard;
    messageText.textContent = "";
    addLog(`${event.type}: ${event.line}`);

    let index = 0;
    const write = () => {
      if (token !== typeToken) return;
      messageText.textContent = event.line.slice(0, index);
      index += 1;
      if (index <= event.line.length) {
        setTimeout(write, 12 + Math.random() * 9);
      } else {
        setTimeout(() => {
          if (token === typeToken) {
            station.classList.remove("is-talking");
          }
        }, 850);
      }
    };
    write();

    if (event.tone === "error" || event.tone === "warning") {
      burstSparks(event.tone === "error" ? 12 : 6);
    }
  }

  function addLog(text) {
    const row = document.createElement("div");
    row.className = "event-tape__row";
    row.textContent = text;
    eventLog.prepend(row);
    while (eventLog.children.length > 2) {
      eventLog.removeChild(eventLog.lastElementChild);
    }
  }

  function burstSparks(count) {
    for (let i = 0; i < count; i += 1) {
      setTimeout(() => spawnSpark(), i * 48);
    }
  }

  function spawnSpark() {
    const anchors = [
      { left: 23, top: 12, dx: 70, dy: 92 },
      { left: 78, top: 13, dx: -52, dy: 105 },
      { left: 11, top: 71, dx: 44, dy: 82 },
    ];
    const anchor = anchors[Math.floor(Math.random() * anchors.length)];
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${anchor.left + Math.random() * 3}%`;
    spark.style.top = `${anchor.top + Math.random() * 4}%`;
    spark.style.setProperty("--dx", `${anchor.dx + Math.random() * 50}px`);
    spark.style.setProperty("--dy", `${anchor.dy + Math.random() * 65}px`);
    sparkLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 900);
  }

  function tickAuto() {
    if (!autoCycle) return;
    eventIndex = (eventIndex + 1) % eventOrder.length;
    setMessage(eventOrder[eventIndex]);
  }

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", () => {
      autoCycle = false;
      autoBtn.setAttribute("aria-pressed", "false");
      const key = button.getAttribute("data-event");
      eventIndex = eventOrder.indexOf(key);
      setMessage(key);
    });
  });

  autoBtn.addEventListener("click", () => {
    autoCycle = !autoCycle;
    autoBtn.setAttribute("aria-pressed", String(autoCycle));
    if (autoCycle) {
      tickAuto();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    reticle.style.left = `${pointer.x * 100}%`;
    reticle.style.top = `${pointer.y * 100}%`;
  });

  window.addEventListener("resize", () => {
    resizeStation();
    resizeCanvas();
  });

  resizeStation();
  resizeCanvas();
  buildWaveform();
  setMessage("blackHole");
  setInterval(tickAuto, 7600);
  setInterval(() => {
    if (Math.random() > 0.58) spawnSpark();
  }, 2200);
  requestAnimationFrame(drawSensor);
})();
