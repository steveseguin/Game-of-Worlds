(function () {
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

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  let width = 1;
  let height = 1;
  let pointer = { x: 0.52, y: 0.48 };
  let autoCycle = true;
  let eventIndex = 0;
  let typeToken = 0;

  const events = {
    probeLost: {
      type: "PROBE LOSS",
      tone: "warning",
      line: "Probe telemetry ended in sector 19. We have signal fragments, no return path, and a widening debris signature.",
    },
    blackHole: {
      type: "GRAVITY ALERT",
      tone: "error",
      line: "Fleet contact lost. The sector contains a black hole. No survivors, no salvage, no second pass.",
    },
    asteroid: {
      type: "HULL DAMAGE",
      tone: "warning",
      line: "Asteroid belt traversal complete. Multiple hulls breached. Secure the field and the route becomes usable.",
    },
    colony: {
      type: "COLONY ONLINE",
      tone: "success",
      line: "Colony beacon is stable. Extractors can begin work as soon as the first construction crew lands.",
    },
    battle: {
      type: "BATTLE REPORT",
      tone: "error",
      line: "Enemy fleet engaged near the inner marker. Tactical display shows weapons fire and unstable command latency.",
    },
    research: {
      type: "RESEARCH",
      tone: "success",
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

  const stars = Array.from({ length: 720 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.5,
    p: Math.random() * Math.PI * 2,
    a: 0.35 + Math.random() * 0.65,
    hue: Math.random() > 0.78 ? "cyan" : "green",
  }));

  const planets = [
    { x: 0.18, y: 0.64, r: 13, color: "#92d77e", ring: true },
    { x: 0.32, y: 0.24, r: 9, color: "#45e1ff" },
    { x: 0.61, y: 0.68, r: 7, color: "#d08844" },
    { x: 0.81, y: 0.36, r: 10, color: "#ffbf47" },
  ];

  function resizeStation() {
    const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    document.documentElement.style.setProperty(
      "--station-scale",
      Math.max(0.1, scale).toFixed(4),
    );
  }

  function resizeCanvas() {
    const ratio = dpr();
    width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function px(x) {
    return x * canvas.clientWidth;
  }

  function py(y) {
    return y * canvas.clientHeight;
  }

  function drawNebula(t) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const blobs = [
      [0.16, 0.28, 0.42, "rgba(39, 164, 111, 0.22)"],
      [0.46, 0.48, 0.52, "rgba(40, 107, 91, 0.26)"],
      [0.78, 0.55, 0.42, "rgba(159, 55, 35, 0.22)"],
      [0.66, 0.18, 0.28, "rgba(255, 191, 71, 0.14)"],
    ];

    blobs.forEach((blob, index) => {
      const drift = Math.sin(t * 0.00018 + index) * 0.022;
      const x = (blob[0] + drift) * w;
      const y = (blob[1] + Math.cos(t * 0.00016 + index) * 0.018) * h;
      const radius = blob[2] * Math.max(w, h);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, blob[3]);
      grad.addColorStop(0.52, blob[3].replace(/0\.\d+\)/, "0.08)"));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function drawGrid(t) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#83ffac";
    ctx.lineWidth = 1;
    const gap = 56;
    const drift = (t * 0.004) % gap;
    for (let x = -gap + drift; x < w + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 22, h);
      ctx.stroke();
    }
    for (let y = -gap + drift * 0.5; y < h + gap; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStars(t) {
    stars.forEach((star) => {
      const flicker = 0.55 + Math.sin(t * 0.002 + star.p) * 0.45;
      ctx.fillStyle =
        star.hue === "cyan"
          ? `rgba(120, 234, 255, ${star.a * flicker})`
          : `rgba(218, 255, 172, ${star.a * flicker})`;
      ctx.beginPath();
      ctx.arc(px(star.x), py(star.y), star.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawSun(x, y, r, t, color) {
    const cx = px(x);
    const cy = py(y);
    const pulse = 1 + Math.sin(t * 0.003) * 0.08;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 5 * pulse);
    grad.addColorStop(0, color);
    grad.addColorStop(0.16, "rgba(255, 191, 71, 0.72)");
    grad.addColorStop(1, "rgba(255, 191, 71, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 191, 71, 0.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        r * (2.2 + i * 1.3 + Math.sin(t * 0.0015 + i) * 0.08),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  function drawPlanets(t) {
    planets.forEach((planet, index) => {
      const x = px(planet.x);
      const y = py(planet.y);
      ctx.save();
      ctx.translate(x, y);
      if (planet.ring) {
        ctx.rotate(-0.35);
        ctx.strokeStyle = "rgba(218,255,172,0.42)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, planet.r * 2.2, planet.r * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.rotate(0.35);
      }
      const grad = ctx.createRadialGradient(
        -planet.r * 0.35,
        -planet.r * 0.45,
        0,
        0,
        0,
        planet.r * 1.5,
      );
      grad.addColorStop(0, "#f0ffd8");
      grad.addColorStop(0.28, planet.color);
      grad.addColorStop(1, "#07100c");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, planet.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = index % 2 ? "#45e1ff" : "#83ffac";
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        planet.r + 12 + Math.sin(t * 0.001 + index) * 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawBlackHole(t) {
    const cx = px(0.7);
    const cy = py(0.55);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.00025);
    for (let i = 0; i < 9; i++) {
      const radius = 28 + i * 13 + Math.sin(t * 0.002 + i) * 2;
      ctx.strokeStyle = `rgba(255, ${90 + i * 10}, 55, ${0.42 - i * 0.032})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.48, radius * 0.55, i * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 44);
    grad.addColorStop(0, "#000000");
    grad.addColorStop(0.42, "#000000");
    grad.addColorStop(0.58, "rgba(255, 85, 61, 0.8)");
    grad.addColorStop(1, "rgba(255, 85, 61, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAsteroids(t) {
    const cx = px(0.5);
    const cy = py(0.38);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.22 + Math.sin(t * 0.0004) * 0.05);
    for (let i = 0; i < 34; i++) {
      const angle = i * 0.54;
      const dist = 42 + (i % 7) * 7;
      const x = Math.cos(angle) * dist * 1.7;
      const y = Math.sin(angle) * dist * 0.42;
      ctx.fillStyle =
        i % 3 === 0 ? "rgba(255,191,71,0.78)" : "rgba(166,139,92,0.7)";
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFleetPaths(t) {
    const paths = [
      [
        [0.16, 0.64],
        [0.32, 0.24],
        [0.5, 0.38],
        [0.7, 0.55],
      ],
      [
        [0.22, 0.2],
        [0.48, 0.31],
        [0.81, 0.36],
      ],
      [
        [0.3, 0.82],
        [0.48, 0.64],
        [0.61, 0.68],
      ],
    ];
    paths.forEach((path, pIndex) => {
      ctx.save();
      ctx.strokeStyle =
        pIndex === 0 ? "rgba(255,191,71,0.72)" : "rgba(69,225,255,0.56)";
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -t * 0.02;
      ctx.lineWidth = pIndex === 0 ? 1.8 : 1.2;
      ctx.beginPath();
      path.forEach((point, index) => {
        const x = px(point[0]);
        const y = py(point[1]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawSensor(t) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#020707");
    bg.addColorStop(0.52, "#061611");
    bg.addColorStop(1, "#150908");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    drawNebula(t);
    drawGrid(t);
    drawStars(t);
    drawSun(0.18, 0.85, 11, t, "#ffd44d");
    drawSun(0.84, 0.2, 8, t + 500, "#7cf8ff");
    drawFleetPaths(t);
    drawAsteroids(t);
    drawPlanets(t);
    drawBlackHole(t);

    ctx.save();
    ctx.strokeStyle = "rgba(131,255,172,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      px(pointer.x),
      py(pointer.y),
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
    for (let i = 0; i < 22; i++) {
      const bar = document.createElement("span");
      bar.style.setProperty("--i", i);
      bar.style.height = `${18 + Math.random() * 62}%`;
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
    messageText.textContent = "";
    addLog(`${event.type}: ${event.line}`);

    let index = 0;
    const write = () => {
      if (token !== typeToken) return;
      messageText.textContent = event.line.slice(0, index);
      index += 1;
      if (index <= event.line.length) {
        setTimeout(write, 10 + Math.random() * 8);
      } else {
        setTimeout(() => {
          if (token === typeToken) {
            station.classList.remove("is-talking");
          }
        }, 900);
      }
    };
    write();

    if (event.tone === "error" || event.tone === "warning") {
      burstSparks(event.tone === "error" ? 10 : 5);
    }
  }

  function addLog(text) {
    const row = document.createElement("div");
    row.className = "event-log__row";
    row.textContent = text;
    eventLog.prepend(row);
    while (eventLog.children.length > 5) {
      eventLog.removeChild(eventLog.lastElementChild);
    }
  }

  function burstSparks(count) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => spawnSpark(), i * 55);
    }
  }

  function spawnSpark() {
    const spark = document.createElement("span");
    spark.className = "spark";
    const left = 4 + Math.random() * 12;
    const top = 18 + Math.random() * 46;
    spark.style.left = `${left}%`;
    spark.style.top = `${top}%`;
    spark.style.setProperty("--dx", `${20 + Math.random() * 80}px`);
    spark.style.setProperty("--dy", `${60 + Math.random() * 120}px`);
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
  setMessage("probeLost");
  setInterval(tickAuto, 7600);
  setInterval(() => {
    if (Math.random() > 0.55) spawnSpark();
  }, 2100);
  requestAnimationFrame(drawSensor);
})();
