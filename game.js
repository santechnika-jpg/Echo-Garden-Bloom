(function () {
  "use strict";

  const CACHE_BEST_KEY = "echoGardenBestRound";
  const CACHE_MODE_KEY = "echoGardenMode";
  const CACHE_MOTION_KEY = "echoGardenReducedMotion";
  const CACHE_CONTRAST_KEY = "echoGardenHighContrast";
  const CACHE_SOUND_KEY = "echoGardenSoundEnabled";
  const initialLength = 3;
  const plants = Array.from(document.querySelectorAll(".plant"));
  const garden = document.getElementById("garden");
  const stateText = document.getElementById("stateText");
  const messagePanel = document.getElementById("messagePanel");
  const roundValue = document.getElementById("roundValue");
  const lengthValue = document.getElementById("lengthValue");
  const bestValue = document.getElementById("bestValue");
  const streakValue = document.getElementById("streakValue");
  const bloomText = document.getElementById("bloomText");
  const modeSummary = document.getElementById("modeSummary");
  const startButton = document.getElementById("startButton");
  const replayButton = document.getElementById("replayButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  const soundToggle = document.getElementById("soundToggle");
  const motionToggle = document.getElementById("motionToggle");
  const contrastToggle = document.getElementById("contrastToggle");
  const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
  const canvas = document.getElementById("ambientCanvas");
  const ctx = canvas.getContext("2d");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const tones = [329.63, 392.0, 493.88, 587.33, 659.25, 739.99];
  const timings = {
    leadIn: 820,
    leadInPractice: 1220,
    leadInReduced: 520,
    playback: 1260,
    playbackPractice: 1540,
    playbackReduced: 920,
    plantActive: 980,
    plantActiveReduced: 360,
    successPause: 920,
    successPauseReduced: 360,
    mistakePause: 980,
    mistakePauseReduced: 520
  };
  const modeLabels = {
    classic: "Klasika",
    zen: "Zen",
    daily: "Dienos",
    practice: "Lėtas"
  };

  const state = {
    mode: "intro",
    playMode: localStorage.getItem(CACHE_MODE_KEY) || "classic",
    sequence: [],
    inputIndex: 0,
    round: 0,
    streak: 0,
    best: Number(localStorage.getItem(CACHE_BEST_KEY) || "0"),
    soundEnabled: readBooleanPreference(CACHE_SOUND_KEY, true),
    audioReady: false,
    audioContext: null,
    masterGain: null,
    pausedBefore: "intro",
    playbackStep: 0,
    playbackTimer: 0,
    reducedMotion: readBooleanPreference(CACHE_MOTION_KEY, motionQuery.matches),
    highContrast: readBooleanPreference(CACHE_CONTRAST_KEY, false),
    dailyRandom: null,
    particles: [],
    fireflies: [],
    stars: [],
    ambientFrame: 0
  };

  function init() {
    bestValue.textContent = String(state.best);
    lengthValue.textContent = String(initialLength);
    streakValue.textContent = "0";
    applyPreferenceClasses();
    setPlantsEnabled(false);
    resizeCanvas();
    seedAmbient();
    updateStageClass();
    updateModeButtons();
    updateBloom();
    updateMotionButton();
    updateContrastButton();
    updateSoundButton();
    bindEvents();
    startAmbientLoop();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
      });
    }
  }

  function bindEvents() {
    startButton.addEventListener("click", startGame);
    replayButton.addEventListener("click", replaySequence);
    pauseButton.addEventListener("click", togglePause);
    resetButton.addEventListener("click", resetGame);
    soundToggle.addEventListener("click", toggleSound);
    motionToggle.addEventListener("click", toggleReducedMotion);
    contrastToggle.addEventListener("click", toggleHighContrast);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", handleKeyboardInput);

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", handleSystemMotionChange);
    }

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => setPlayMode(button.dataset.mode));
    });

    plants.forEach((plant) => {
      plant.addEventListener("click", () => {
        handlePlantInput(Number(plant.dataset.plant));
      });
    });
  }

  function ensureAudio() {
    if (state.audioReady || !state.soundEnabled) {
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      state.soundEnabled = false;
      updateSoundButton();
      return;
    }

    state.audioContext = new AudioContext();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = 0.48;
    state.masterGain.connect(state.audioContext.destination);
    state.audioReady = true;
  }

  function playTone(index, soft) {
    if (!state.soundEnabled) {
      return;
    }

    ensureAudio();
    if (!state.audioContext || !state.masterGain) {
      return;
    }

    const now = state.audioContext.currentTime;
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const filter = state.audioContext.createBiquadFilter();

    osc.type = soft ? "sine" : "triangle";
    osc.frequency.setValueAtTime(tones[index], now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(soft ? 1450 : 1850, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(soft ? 0.22 : 0.32, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(state.masterGain);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  function playMistakeTone() {
    if (!state.soundEnabled) {
      return;
    }

    ensureAudio();
    if (!state.audioContext || !state.masterGain) {
      return;
    }

    const now = state.audioContext.currentTime;
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(174.61, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain);
    gain.connect(state.masterGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  function startGame() {
    ensureAudio();
    clearPlaybackTimer();
    state.dailyRandom = state.playMode === "daily" ? seededRandom(getDailySeed()) : null;
    state.sequence = randomSequence(initialLength);
    state.inputIndex = 0;
    state.playbackStep = 0;
    state.round = 1;
    state.streak = 0;
    setMode("playback");
    startButton.textContent = "Iš naujo";
    startButton.setAttribute("aria-label", "Pradėti iš naujo");
    pauseButton.disabled = false;
    updateStats();
    showMessage(getStartMessage());
    playSequence(0);
  }

  function resetGame() {
    clearPlaybackTimer();
    state.sequence = [];
    state.inputIndex = 0;
    state.playbackStep = 0;
    state.round = 0;
    state.streak = 0;
    state.dailyRandom = null;
    setMode("intro");
    setPlantsEnabled(false);
    replayButton.disabled = true;
    pauseButton.disabled = true;
    pauseButton.textContent = "Pauzė";
    startButton.textContent = "Pradėti";
    startButton.setAttribute("aria-label", "Pradėti žaidimą");
    updateStats();
    showMessage("Pradžia: 3 impulsai. Kiekvienas teisingas raundas prideda dar vieną aidą.");
  }

  function replaySequence() {
    if (!state.sequence.length || state.mode === "playback" || state.mode === "paused") {
      return;
    }
    state.playbackStep = 0;
    state.inputIndex = 0;
    setMode("playback");
    showMessage("Pakartoju tą pačią sodo melodiją.");
    playSequence(0);
  }

  function togglePause() {
    if (state.mode === "intro") {
      return;
    }

    if (state.mode === "paused") {
      pauseButton.textContent = "Pauzė";
      if (state.pausedBefore === "playback") {
        setMode("playback");
        showMessage("Tęsiame seką nuo sustojimo vietos.");
        playSequence(state.playbackStep);
        return;
      }

      setMode(state.pausedBefore);
      showMessage(state.mode === "input" ? "Gali spausti augalus." : "Tęsiame sodą.");
      setPlantsEnabled(state.mode === "input");
      return;
    }

    state.pausedBefore = state.mode;
    clearPlaybackTimer();
    setMode("paused");
    setPlantsEnabled(false);
    pauseButton.textContent = "Tęsti";
    showMessage("Žaidimas pristabdytas.");
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(CACHE_SOUND_KEY, String(state.soundEnabled));
    updateSoundButton();
    if (state.soundEnabled) {
      ensureAudio();
      playTone(0, true);
    }
  }

  function toggleReducedMotion() {
    state.reducedMotion = !state.reducedMotion;
    localStorage.setItem(CACHE_MOTION_KEY, String(state.reducedMotion));
    applyPreferenceClasses();
    updateMotionButton();
    startAmbientLoop();
  }

  function toggleHighContrast() {
    state.highContrast = !state.highContrast;
    localStorage.setItem(CACHE_CONTRAST_KEY, String(state.highContrast));
    applyPreferenceClasses();
    updateContrastButton();
  }

  function handleSystemMotionChange(event) {
    if (localStorage.getItem(CACHE_MOTION_KEY) === null) {
      state.reducedMotion = event.matches;
      applyPreferenceClasses();
      updateMotionButton();
      startAmbientLoop();
    }
  }

  function setPlayMode(mode) {
    if (!modeLabels[mode]) {
      return;
    }

    state.playMode = mode;
    localStorage.setItem(CACHE_MODE_KEY, mode);
    updateModeButtons();
    if (state.mode === "intro") {
      showMessage(`Pasirinktas režimas: ${modeLabels[mode]}.`);
    } else {
      showMessage(`Režimas pakeistas į ${modeLabels[mode]}. Naujas režimas galios nuo kitos pradžios.`);
    }
  }

  function handlePlantInput(index) {
    if (state.mode !== "input") {
      return;
    }

    ensureAudio();
    activatePlant(index, false);
    vibrate(18);

    if (index !== state.sequence[state.inputIndex]) {
      handleMistake();
      return;
    }

    state.inputIndex += 1;
    if (state.inputIndex >= state.sequence.length) {
      handleSuccess();
    } else {
      showMessage(`Teisingai. Liko ${state.sequence.length - state.inputIndex}.`);
    }
  }

  function handleSuccess() {
    setMode("success");
    setPlantsEnabled(false);
    state.streak += 1;
    state.best = Math.max(state.best, state.round);
    localStorage.setItem(CACHE_BEST_KEY, String(state.best));
    document.body.classList.add("success-glow");
    vibrate([24, 36, 24]);
    showMessage(getSuccessMessage());
    updateStats();

    window.setTimeout(() => {
      document.body.classList.remove("success-glow");
      state.round += 1;
      state.sequence.push(randomPlantIndex());
      state.inputIndex = 0;
      state.playbackStep = 0;
      updateStats();
      setMode("playback");
      showMessage("Stebėk naują ilgesnę melodiją.");
      playSequence(0);
    }, state.reducedMotion ? timings.successPauseReduced : timings.successPause);
  }

  function handleMistake() {
    setMode("mistake");
    setPlantsEnabled(false);
    playMistakeTone();
    vibrate(state.playMode === "zen" ? 20 : [40, 50, 40]);

    if (state.playMode !== "zen") {
      state.streak = 0;
      document.body.classList.add("mistake-flash");
    }

    showMessage(state.playMode === "zen"
      ? "Zen režimas: seka ramiai sugrįžta be pritemdymo."
      : "Švelnus nukrypimas. Ta pati seka grįžta dar kartą.");
    updateStats();

    window.setTimeout(() => {
      document.body.classList.remove("mistake-flash");
      state.inputIndex = 0;
      state.playbackStep = 0;
      setMode("playback");
      playSequence(0);
    }, state.reducedMotion ? timings.mistakePauseReduced : timings.mistakePause);
  }

  function playSequence(startStep) {
    clearPlaybackTimer();
    setPlantsEnabled(false);
    replayButton.disabled = true;
    state.playbackStep = startStep;

    const next = () => {
      if (state.mode !== "playback") {
        return;
      }

      if (state.playbackStep >= state.sequence.length) {
        state.inputIndex = 0;
        setMode("input");
        setPlantsEnabled(true);
        replayButton.disabled = false;
        showMessage("Dabar tavo eilė. Paliesk augalus ta pačia seka.");
        return;
      }

      activatePlant(state.sequence[state.playbackStep], true);
      state.playbackStep += 1;
      state.playbackTimer = window.setTimeout(next, getPlaybackDelay());
    };

    state.playbackTimer = window.setTimeout(next, getLeadInDelay());
  }

  function activatePlant(index, soft) {
    const plant = plants[index];
    if (!plant) {
      return;
    }

    plant.classList.remove("active");
    void plant.offsetWidth;
    plant.classList.add("active");
    playTone(index, soft);

    if (!state.reducedMotion) {
      addLightTrail(plant);
    }

    window.setTimeout(() => {
      plant.classList.remove("active");
    }, state.reducedMotion ? timings.plantActiveReduced : timings.plantActive);
  }

  function addLightTrail(plant) {
    const plantRect = plant.getBoundingClientRect();
    const x = plantRect.left + plantRect.width / 2;
    const y = plantRect.top + plantRect.height / 2;
    state.particles.push({
      x,
      y,
      age: 0,
      life: 820,
      radius: 8 + Math.random() * 5,
      color: getComputedStyle(plant).getPropertyValue("--accent").trim()
    });
  }

  function handleKeyboardInput(event) {
    const digit = Number(event.key);
    if (digit >= 1 && digit <= plants.length) {
      handlePlantInput(digit - 1);
    }
  }

  function setMode(mode) {
    state.mode = mode;
    updateStageClass();
  }

  function updateStageClass() {
    document.body.classList.toggle("is-showing", state.mode === "playback");
    document.body.classList.toggle("is-input", state.mode === "input");
    document.body.classList.toggle("paused", state.mode === "paused");
    document.body.classList.toggle("level-5", state.best >= 5 || state.round >= 5);
    document.body.classList.toggle("level-10", state.best >= 10 || state.round >= 10);
    document.body.classList.toggle("level-15", state.best >= 15 || state.round >= 15);

    const labels = {
      intro: "Paliesk „Pradėti“ ir įsimink sodo aidą.",
      playback: "Sodas rodo seką.",
      input: "Tavo eilė atkartoti seką.",
      success: "Raundas pavyko.",
      mistake: "Seka kartojama.",
      paused: "Žaidimas pristabdytas."
    };
    stateText.textContent = labels[state.mode] || labels.intro;
  }

  function updateStats() {
    roundValue.textContent = String(state.round);
    lengthValue.textContent = String(state.sequence.length || initialLength);
    bestValue.textContent = String(state.best);
    streakValue.textContent = String(state.streak);
    updateBloom();
    updateStageClass();
  }

  function updateSoundButton() {
    soundToggle.textContent = state.soundEnabled ? "Garsas įj." : "Garsas išj.";
    soundToggle.setAttribute("aria-label", state.soundEnabled ? "Išjungti garsą" : "Įjungti garsą");
    soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
  }

  function updateMotionButton() {
    motionToggle.textContent = state.reducedMotion ? "Judesis mažas" : "Mažiau judesio";
    motionToggle.setAttribute("aria-label", state.reducedMotion ? "Grąžinti įprastą judesį" : "Sumažinti judesį");
    motionToggle.setAttribute("aria-pressed", String(state.reducedMotion));
  }

  function updateContrastButton() {
    contrastToggle.textContent = state.highContrast ? "Kontrastas ryškus" : "Ryškus kontrastas";
    contrastToggle.setAttribute("aria-label", state.highContrast ? "Išjungti ryškų kontrastą" : "Įjungti ryškų kontrastą");
    contrastToggle.setAttribute("aria-pressed", String(state.highContrast));
  }

  function updateModeButtons() {
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.playMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (modeSummary) {
      modeSummary.textContent = modeLabels[state.playMode] || modeLabels.classic;
    }
  }

  function updateBloom() {
    const bloomLevel = Math.min(5, Math.floor(Math.max(state.round, state.best) / 3));
    document.body.dataset.bloom = String(bloomLevel);
    if (!bloomText) {
      return;
    }

    const labels = [
      "Sodas miega",
      "Pirmas žiedas",
      "Šviesa bunda",
      "Takas švyti",
      "Sodas dainuoja",
      "Pilnas žydėjimas"
    ];
    bloomText.textContent = labels[bloomLevel];
  }

  function applyPreferenceClasses() {
    document.body.classList.toggle("reduced-motion", state.reducedMotion);
    document.body.classList.toggle("high-contrast", state.highContrast);
  }

  function showMessage(text) {
    messagePanel.textContent = text;
  }

  function setPlantsEnabled(enabled) {
    plants.forEach((plant) => {
      plant.disabled = !enabled;
    });
  }

  function randomSequence(length) {
    return Array.from({ length }, randomPlantIndex);
  }

  function randomPlantIndex() {
    if (state.dailyRandom) {
      return Math.floor(state.dailyRandom() * plants.length);
    }
    return Math.floor(Math.random() * plants.length);
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function getDailySeed() {
    const today = new Date();
    const stamp = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let seed = 2166136261;
    for (let index = 0; index < stamp.length; index += 1) {
      seed ^= stamp.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return seed;
  }

  function getPlaybackDelay() {
    if (state.reducedMotion) {
      return timings.playbackReduced;
    }
    return state.playMode === "practice" ? timings.playbackPractice : timings.playback;
  }

  function getLeadInDelay() {
    if (state.reducedMotion) {
      return timings.leadInReduced;
    }
    return state.playMode === "practice" ? timings.leadInPractice : timings.leadIn;
  }

  function getSuccessMessage() {
    if (state.streak >= 5) {
      return `Sodas įsiminė tavo ritmą. Serija: ${state.streak}.`;
    }
    if (state.streak >= 3) {
      return `Graži serija: ${state.streak}. Naujas impulsas prisijungia prie sekos.`;
    }
    return "Sodas atsakė šviesa. Naujas impulsas prisijungia prie sekos.";
  }

  function getStartMessage() {
    if (state.playMode === "daily") {
      return "Dienos režimas: šiandienos sodo seka visada prasideda taip pat.";
    }
    if (state.playMode === "practice") {
      return "Lėtas režimas: sodas rodo seką lėtesniu ritmu.";
    }
    if (state.playMode === "zen") {
      return "Zen režimas: klaidos praeina švelniau, o sodas ramiai pakartoja seką.";
    }
    return "Sodas rodo pavyzdį. Stebėk šviesą ir ritmą.";
  }

  function clearPlaybackTimer() {
    if (state.playbackTimer) {
      window.clearTimeout(state.playbackTimer);
      state.playbackTimer = 0;
    }
  }

  function readBooleanPreference(key, fallback) {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return fallback;
    }
    return stored === "true";
  }

  function vibrate(pattern) {
    if (state.reducedMotion || !("vibrate" in navigator)) {
      return;
    }
    navigator.vibrate(pattern);
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    seedAmbient();
    if (state.reducedMotion) {
      drawAmbient(performance.now());
    }
  }

  function seedAmbient() {
    const width = window.innerWidth || 360;
    const height = window.innerHeight || 720;
    const level = Math.max(state.best, state.round);
    const starCount = state.reducedMotion ? 18 : (level >= 5 ? 58 : 34);
    const flyCount = state.reducedMotion ? 0 : (level >= 10 ? 9 : 4);

    state.stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.72,
      size: 0.7 + Math.random() * 1.6,
      pulse: Math.random() * Math.PI * 2
    }));

    state.fireflies = Array.from({ length: flyCount }, () => ({
      x: Math.random() * width,
      y: height * (0.18 + Math.random() * 0.64),
      speed: 0.15 + Math.random() * 0.22,
      drift: Math.random() * Math.PI * 2,
      color: Math.random() > 0.5 ? "rgba(242,207,115," : "rgba(126,230,168,"
    }));
  }

  function startAmbientLoop() {
    if (state.ambientFrame) {
      cancelAnimationFrame(state.ambientFrame);
      state.ambientFrame = 0;
    }

    seedAmbient();
    drawAmbient(performance.now());
    if (!state.reducedMotion) {
      state.ambientFrame = requestAnimationFrame(ambientTick);
    }
  }

  function ambientTick(now) {
    drawAmbient(now);
    state.ambientFrame = requestAnimationFrame(ambientTick);
  }

  function drawAmbient(now) {
    const width = window.innerWidth || 360;
    const height = window.innerHeight || 720;
    ctx.clearRect(0, 0, width, height);

    drawStars(now);
    drawMist(now, width, height);
    if (!state.reducedMotion) {
      drawFireflies(now, width, height);
      drawParticles(now);
    }
  }

  function drawStars(now) {
    state.stars.forEach((star) => {
      const pulse = state.reducedMotion ? 0 : Math.sin(now / 1200 + star.pulse) * 0.12;
      const alpha = 0.18 + pulse;
      ctx.fillStyle = `rgba(214, 247, 226, ${Math.max(0.08, alpha)})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMist(now, width, height) {
    const level = Math.max(state.best, state.round);
    if (level < 10 || state.reducedMotion) {
      return;
    }

    for (let i = 0; i < 3; i += 1) {
      const x = ((now * 0.012 * (i + 1)) % (width + 260)) - 130;
      const y = height * (0.34 + i * 0.17);
      const gradient = ctx.createRadialGradient(x, y, 20, x, y, 180);
      gradient.addColorStop(0, "rgba(196, 241, 221, 0.055)");
      gradient.addColorStop(1, "rgba(196, 241, 221, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, 190, 54, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFireflies(now, width, height) {
    state.fireflies.forEach((fly, index) => {
      fly.drift += 0.006 + index * 0.0004;
      fly.x += fly.speed;
      fly.y += Math.sin(fly.drift) * 0.18;
      if (fly.x > width + 20) {
        fly.x = -20;
        fly.y = height * (0.18 + Math.random() * 0.64);
      }

      const alpha = 0.2 + Math.sin(now / 460 + index) * 0.14;
      ctx.fillStyle = `${fly.color}${Math.max(0.1, alpha)})`;
      ctx.beginPath();
      ctx.arc(fly.x, fly.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles(now) {
    const last = state.lastParticleFrame || now;
    const delta = Math.min(40, now - last);
    state.lastParticleFrame = now;

    state.particles = state.particles.filter((particle) => {
      particle.age += delta;
      const progress = particle.age / particle.life;
      if (progress >= 1) {
        return false;
      }

      const alpha = (1 - progress) * 0.22;
      const radius = particle.radius + progress * 34;
      ctx.strokeStyle = particle.color.replace(")", `, ${alpha})`).replace("rgb", "rgba");
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
  }

  init();
})();
