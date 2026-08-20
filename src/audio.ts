/* =========================================================================
   Rift Dodge — procedurális hangmotor (Web Audio API).
   Nincs külső hangfájl: minden SFX kódból szintetizálódik, így jogtiszta,
   offline is működik és nulla asset. LoL-hangulatú, "arra hasonlító" hangok.
   A böngésző autoplay-szabálya miatt az AudioContext csak első felhasználói
   interakcióra indul — ezért az ensure()-t input-eseményből hívjuk.
   ========================================================================= */

class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
    return this.muted;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Oszcillátor frekvencia-rámpával és burkológörbével. */
  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    delay = 0
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Zajos réteg (robbanás, whoosh) sávszűrővel. */
  private noise(dur: number, peak: number, filterType: BiquadFilterType, freq: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.t + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- Konkrét SFX-ek ----
  basic(): void { this.tone("square", 620, 300, 0.09, 0.12); }

  flash(): void {
    this.tone("sine", 300, 1200, 0.16, 0.14);
    this.noise(0.14, 0.06, "highpass", 1400);
  }

  ezrealShift(): void {
    this.tone("triangle", 500, 1300, 0.18, 0.13);
    this.tone("sine", 900, 1600, 0.14, 0.08, 0.02);
  }

  tumble(): void {
    this.noise(0.16, 0.1, "bandpass", 900);
    this.tone("sine", 260, 160, 0.14, 0.07);
  }

  cast(style: string): void {
    // rövid varázslás-zap, bajnokonként kicsit más karakter
    const map: Record<string, [number, number]> = {
      ezreal: [900, 520], ryze: [420, 260], ashe: [700, 300], lux: [1000, 640], ziggs: [520, 340],
    };
    const [a, b] = map[style] || [700, 400];
    this.tone(style === "ryze" ? "sawtooth" : "triangle", a, b, 0.12, 0.09);
  }

  impact(style: string): void {
    this.tone("sine", style === "ashe" ? 240 : 360, 90, 0.14, 0.12);
    this.noise(0.1, 0.07, "lowpass", 900);
  }

  kill(): void {
    this.tone("triangle", 700, 1400, 0.1, 0.1);
    this.tone("sine", 500, 900, 0.14, 0.07, 0.03);
  }

  hurt(): void { this.tone("square", 180, 90, 0.14, 0.13); }

  death(): void {
    this.tone("sawtooth", 300, 60, 0.6, 0.18);
    this.noise(0.5, 0.12, "lowpass", 600);
  }

  // Lux Final Spark: feltöltés majd fényes elsülés
  luxCharge(dur: number): void {
    this.tone("sine", 220, 950, dur, 0.1);
    this.tone("triangle", 440, 1400, dur, 0.05);
  }
  luxBeam(): void {
    this.tone("sawtooth", 1300, 500, 0.35, 0.16);
    this.tone("sine", 1800, 700, 0.3, 0.1);
    this.noise(0.3, 0.1, "highpass", 1200);
  }

  // Ziggs Mega Inferno Bomb: érkező fütty majd nagy robbanás
  ziggsWhistle(dur: number): void {
    this.tone("sine", 1300, 420, dur, 0.09);
  }
  ziggsBoom(): void {
    this.tone("sine", 160, 40, 0.7, 0.22);
    this.tone("sawtooth", 120, 30, 0.5, 0.12);
    this.noise(0.6, 0.2, "lowpass", 700);
  }
}

export const audio = new AudioKit();
