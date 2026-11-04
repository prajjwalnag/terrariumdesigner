/**
 * Jungle-safari background sound, generated live with the Web Audio API (no audio files).
 * Layers: low drone, rustling leaves, crickets, bird calls, a drum and shaker groove, and a sparse kalimba melody
 * in A minor pentatonic. Everything is quiet and runs through a compressor so it never clips.
 */
export function createJungle() {
  const BPM = 96;
  const STEP = 60 / BPM / 4; // one sixteenth note
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // A3 C4 D4 E4 G4 A4 C5 D5
  const KICK = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
  const TOM = [0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const WOOD = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0];

  let ctx = null, master, send, analyser, noiseBuf;
  let timer = null, nextTime = 0, step = 0, playing = false, volume = 0.35;

  function noiseSource(loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop;
    return s;
  }

  /** Connect a source to the dry bus and, optionally, the echo send. */
  function out(node, wet = 0.3) {
    node.connect(master);
    if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(send); }
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.01; comp.release.value = 0.25;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

    // Echo: a dotted-eighth delay with a darkened feedback loop gives the jungle some space.
    send = ctx.createGain();
    const delay = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    delay.delayTime.value = STEP * 3; fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 2200;
    send.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Leaves rustling: band-passed noise whose level drifts slowly.
    const leaves = noiseSource(), lf = ctx.createBiquadFilter(), lg = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lf.type = 'bandpass'; lf.frequency.value = 1700; lf.Q.value = 0.5;
    lg.gain.value = 0.05; lfo.frequency.value = 0.13; lfoG.gain.value = 0.03;
    leaves.connect(lf); lf.connect(lg); lfo.connect(lfoG); lfoG.connect(lg.gain); out(lg, 0);
    leaves.start(); lfo.start();

    // Crickets: three high tones switched on and off about 28 times a second.
    [4300, 4650, 5100].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), pulse = ctx.createOscillator(), pg = ctx.createGain();
      o.frequency.value = f; g.gain.value = 0.004;
      pulse.type = 'square'; pulse.frequency.value = 26 + i * 2.5; pg.gain.value = 0.004;
      o.connect(g); pulse.connect(pg); pg.connect(g.gain); out(g, 0.15);
      o.start(); pulse.start();
    });

    // Low drone on A and E.
    [55, 82.41].forEach((f) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.045;
      o.connect(g); out(g, 0);
      o.start();
    });
  }

  // ---- voices ----
  function drum(t, f0, f1, len, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); out(g, 0.18);
    o.start(t); o.stop(t + len + 0.05);
  }
  function shaker(t, gain) {
    const s = noiseSource(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 7200; f.Q.value = 1.2;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f); f.connect(g); out(g, 0.1);
    s.start(t, Math.random(), 0.1);
  }
  function wood(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 960;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); out(g, 0.25);
    o.start(t); o.stop(t + 0.08);
  }
  function pluck(t, f, gain) {
    [[1, 1], [2, 0.18]].forEach(([mult, amp]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = mult === 1 ? 'triangle' : 'sine'; o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); out(g, 0.55);
      o.start(t); o.stop(t + 1);
    });
  }
  function bird(t) {
    const notes = 2 + Math.floor(Math.random() * 4), base = 2000 + Math.random() * 1800, gap = 0.08 + Math.random() * 0.07;
    const up = Math.random() < 0.5;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * gap;
      const f = base * (1 + (up ? i : -i) * 0.07);
      o.type = 'sine';
      o.frequency.setValueAtTime(f, s);
      o.frequency.exponentialRampToValueAtTime(f * (up ? 1.25 : 0.8), s + 0.07);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.02, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.085);
      o.connect(g); out(g, 0.5);
      o.start(s); o.stop(s + 0.1);
    }
  }

  function schedule(i, t) {
    const k = i % 16, bar = Math.floor(i / 16);
    if (KICK[k]) drum(t, 130, 52, 0.45, 0.32);
    if (TOM[k]) drum(t, 210, 120, 0.22, 0.14 + (bar % 4 === 3 ? 0.05 : 0));
    if (k % 2 === 0) shaker(t, k % 4 === 0 ? 0.05 : 0.028);
    else if (Math.random() < 0.35) shaker(t, 0.015);
    if (WOOD[k] && bar % 2 === 1) wood(t);
    if (k >= 2 && Math.random() < 0.16) pluck(t, SCALE[Math.floor(Math.random() * SCALE.length)], 0.07);
    if (Math.random() < 0.012) bird(t + Math.random() * 0.3);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.18) {
      schedule(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  const onVisibility = () => {
    if (!ctx || !playing) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  };

  return {
    get playing() { return playing; },
    async start() {
      if (playing) return;
      if (!ctx) build();
      await ctx.resume();
      playing = true;
      nextTime = ctx.currentTime + 0.1;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.6);
      timer = setInterval(tick, 40);
      document.addEventListener('visibilitychange', onVisibility);
    },
    stop() {
      if (!playing) return;
      playing = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => { if (!playing && ctx) ctx.suspend(); }, 1200);
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (playing) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
    },
    /** Peak level of the last moment of output, 0..1 (for checks). */
    level() {
      if (!analyser) return 0;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    },
  };
}
