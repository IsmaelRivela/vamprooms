/**
 * Ambiente backrooms: zumbido de fluorescentes, hum eléctrico, chasquidos suaves.
 * Sin sonidos de amenaza — solo infraestructura fallando.
 */
export class BackroomsAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private buzzGain: GainNode | null = null;
  private started = false;

  /** Requiere gesto del usuario (click en canvas). */
  start(): void {
    if (this.started) return;
    this.started = true;

    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.38;
    this.master.connect(this.ctx.destination);

    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.22;
    this.humGain.connect(this.master);

    this.buzzGain = this.ctx.createGain();
    this.buzzGain.gain.value = 0.08;
    this.buzzGain.connect(this.master);

    this.startHum();
    this.startBuzz();
    this.scheduleFlickerCrackles();
  }

  private startHum(): void {
    if (!this.ctx || !this.humGain) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 120;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07 + Math.random() * 0.04;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(this.humGain.gain);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(this.humGain);

    osc.start();
    osc2.start();
    lfo.start();
  }

  private startBuzz(): void {
    if (!this.ctx || !this.buzzGain) return;
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2800;
    band.Q.value = 8;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 600;
    lfo.connect(lfoG);
    lfoG.connect(band.frequency);

    noise.connect(band);
    band.connect(this.buzzGain);
    noise.start();
    lfo.start();
  }

  private scheduleFlickerCrackles(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const crackle = () => {
      if (!this.master) return;
      const burst = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * (0.02 + Math.random() * 0.06));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      burst.buffer = buf;

      const g = ctx.createGain();
      g.gain.value = 0.04 + Math.random() * 0.07;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;

      burst.connect(hp);
      hp.connect(g);
      g.connect(this.master);

      burst.start();
      setTimeout(crackle, 800 + Math.random() * 4500);
    };

    setTimeout(crackle, 1200 + Math.random() * 2000);
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.started = false;
  }
}
