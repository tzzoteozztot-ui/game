/**
 * Procedural Web Audio Engine for «Тёмный рубеж»
 * Ambient generative loop & retro-fantasy synthesis. Zero external assets.
 */

export interface AudioSettings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private isMusicPlaying = false;
  private ambientTimer: number | null = null;

  // Свои звуки Артура (2026-11-13): `public/sounds/sounds.json` связывает событие с файлами, см. `public/sounds/README.md`.
  // Нет записи для события — играет прежний синтез; музыка из файла заменяет синтезированную.
  private manifest: Record<string, string | string[]> = {};
  private manifestLoaded = false;
  private manifestRequested = false;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private scene: 'menu' | 'world' | 'battle' = 'menu';
  private musicSrc: { src: AudioBufferSourceNode; gain: GainNode; key: string } | null = null;
  private voice: AudioBufferSourceNode | null = null;

  private settings: AudioSettings = {
    musicVolume: 0.5,
    sfxVolume: 0.7,
    muted: false,
  };

  constructor() {
    this.loadSettings();
    if (typeof document !== 'undefined') {
      // Нажатие любой кнопки интерфейса (холст поля не в счёт)
      document.addEventListener('click', (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('button')) this.play('ui.click');
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pause();
        } else if (!this.settings.muted) {
          this.resume();
        }
      });
    }
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem('dark_frontier_sound');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.musicVolume === 'number') this.settings.musicVolume = parsed.musicVolume;
        if (typeof parsed.sfxVolume === 'number') this.settings.sfxVolume = parsed.sfxVolume;
        if (typeof parsed.muted === 'boolean') this.settings.muted = parsed.muted;
      }
    } catch {
      // ignore localStorage errors
    }
  }

  public saveSettings() {
    try {
      localStorage.setItem('dark_frontier_sound', JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setMusicVolume(val: number) {
    this.settings.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(
        this.settings.muted ? 0 : this.settings.musicVolume * 0.4,
        this.ctx.currentTime
      );
    }
    this.saveSettings();
  }

  public setSfxVolume(val: number) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(
        this.settings.muted ? 0 : this.settings.sfxVolume,
        this.ctx.currentTime
      );
    }
    this.saveSettings();
  }

  public toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : 1, this.ctx.currentTime);
    }
    this.saveSettings();
    return this.settings.muted;
  }

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : 1, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(
      this.settings.muted ? 0 : this.settings.musicVolume * 0.4,
      this.ctx.currentTime
    );
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(
      this.settings.muted ? 0 : this.settings.sfxVolume,
      this.ctx.currentTime
    );
    this.sfxGain.connect(this.masterGain);

    void this.loadManifest();
    this.applyMusic();
  }

  // -------------------------------------------------------------
  // Свои записи (по готовности звуков Артура)
  // -------------------------------------------------------------
  private files(key: string): string[] {
    const v = this.manifest[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  }

  private async loadBuffer(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file)!;
    if (!this.ctx || this.loading.has(file)) return null;
    this.loading.add(file);
    try {
      const res = await fetch(`sounds/${file}`);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(file, buf);
      return buf;
    } catch {
      return null; // нет файла или формат не читается — остаётся синтез
    } finally {
      this.loading.delete(file);
    }
  }

  private async loadManifest() {
    if (this.manifestRequested) return;
    this.manifestRequested = true;
    try {
      const res = await fetch('sounds/sounds.json');
      if (res.ok) {
        const m = await res.json();
        if (m && typeof m === 'object') this.manifest = m;
      }
    } catch {
      /* без записей игра звучит синтезом */
    }
    this.manifestLoaded = true;
    // Короткие звуки подгружаем заранее, музыку и голоса — по требованию
    for (const [key, v] of Object.entries(this.manifest))
      if (!key.startsWith('music.') && !key.startsWith('voice.')) for (const f of Array.isArray(v) ? v : [v]) void this.loadBuffer(f);
    this.applyMusic();
  }

  /** Событие со своей записью: играет случайный вариант и возвращает true; иначе false — тогда играет синтез */
  private playSample(key: string, gap = 0): boolean {
    const files = this.files(key);
    if (!files.length || !this.ctx || !this.sfxGain) return false;
    const buf = this.buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buf) return false;
    if (gap && this.tooSoon(key, gap)) return true;
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start();
    return true;
  }

  /** Звук интерфейса и событий без синтеза: `ui.click`, `map.event`, `dialog.line`… Нет записи — тишина */
  public play(key: string) {
    if (this.settings.muted) return;
    this.playSample(key, 0.03);
  }

  /** Озвучка реплики диалога: `voice.<сцена>.<номер реплики с 1>`; предыдущая обрывается */
  public playVoice(sceneId: string, line: number) {
    try {
      this.voice?.stop();
    } catch {
      /* уже кончилась */
    }
    this.voice = null;
    const key = `voice.${sceneId}.${line}`;
    const file = this.files(key)[0];
    if (!file || !this.ctx || !this.sfxGain || this.settings.muted) return;
    void this.loadBuffer(file).then((buf) => {
      if (!buf || !this.ctx || !this.sfxGain) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      src.start();
      this.voice = src;
    });
  }

  /** Где играем: меню, карта похода или бой. Музыка меняется с плавным переходом */
  public setScene(scene: 'menu' | 'world' | 'battle') {
    if (scene === this.scene) return;
    this.scene = scene;
    this.applyMusic();
  }

  private applyMusic() {
    if (!this.ctx || !this.musicGain || !this.manifestLoaded) return;
    const key = `music.${this.scene}`;
    const file = this.files(key)[0];
    if (!file) {
      this.stopSampleMusic();
      this.startAmbient();
      return;
    }
    if (this.musicSrc?.key === key) return;
    void this.loadBuffer(file).then((buf) => {
      if (!buf || !this.ctx || !this.musicGain || this.scene !== key.slice(6)) return;
      this.stopAmbient();
      this.stopSampleMusic();
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
      gain.connect(this.musicGain);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
      this.musicSrc = { src, gain, key };
    });
  }

  private stopSampleMusic() {
    const m = this.musicSrc;
    if (!m || !this.ctx) return;
    this.musicSrc = null;
    m.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    m.gain.gain.setValueAtTime(m.gain.gain.value, this.ctx.currentTime);
    m.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
    try {
      m.src.stop(this.ctx.currentTime + 1.1);
    } catch {
      /* уже остановлена */
    }
  }

  private stopAmbient() {
    this.isMusicPlaying = false;
    if (this.ambientTimer !== null) clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  // -------------------------------------------------------------
  // Dark Fantasy Ambient Music Synthesizer
  // Generative minor chords & brooding bass drones
  // -------------------------------------------------------------
  private startAmbient() {
    if (!this.ctx || !this.musicGain || this.isMusicPlaying) return;
    this.isMusicPlaying = true;

    // Minor progression notes (D minor / modal):
    // D2, A2, F2, C3, Bb2, G2
    const dronePitches = [73.42, 110.0, 87.31, 130.81, 116.54, 98.0];
    const highArpPitches = [293.66, 349.23, 440.0, 523.25, 587.33, 698.46];

    let step = 0;

    const playChordBeat = () => {
      if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;
      if (this.ctx.state !== 'running') {
        this.ambientTimer = window.setTimeout(playChordBeat, 2000);
        return;
      }

      const now = this.ctx.currentTime;
      const rootPitch = dronePitches[step % dronePitches.length];
      step++;

      // Drone oscillator 1 (Triangle wave with low pass filter)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const noteGain = this.ctx.createGain();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 5.5);

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(rootPitch, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(rootPitch * 1.5, now); // Fifth harmonic

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.35, now + 2.0);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 6.0);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.musicGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 6.2);
      osc2.stop(now + 6.2);

      // Subtle arpeggiated chiming note
      if (step % 2 === 0) {
        const arpOsc = this.ctx.createOscillator();
        const arpGain = this.ctx.createGain();
        const arpPitch = highArpPitches[Math.floor(Math.random() * highArpPitches.length)];

        arpOsc.type = 'sine';
        arpOsc.frequency.setValueAtTime(arpPitch, now + 1.2);

        arpGain.gain.setValueAtTime(0.001, now + 1.2);
        arpGain.gain.linearRampToValueAtTime(0.08, now + 1.6);
        arpGain.gain.exponentialRampToValueAtTime(0.001, now + 4.5);

        arpOsc.connect(arpGain);
        arpGain.connect(this.musicGain);

        arpOsc.start(now + 1.2);
        arpOsc.stop(now + 4.6);
      }

      this.ambientTimer = window.setTimeout(playChordBeat, 4500);
    };

    playChordBeat();
  }

  // -------------------------------------------------------------
  // Sound Effects
  // -------------------------------------------------------------
  /**
   * Frequent sounds (shots, hits, deaths) play at most once per `gap` seconds each: a full field at
   * ×5 fires hundreds of shots a second, and as many voices at once crackle and load the phone.
   */
  private lastPlayed: Record<string, number> = {};
  private tooSoon(key: string, gap: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastPlayed[key] ?? -Infinity) < gap) return true;
    this.lastPlayed[key] = now;
    return false;
  }

  public playShot(type: 'archer' | 'mage' | 'ballista' | 'priest') {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample(`shot.${type}`, 0.06)) return;
    if (this.tooSoon(`shot_${type}`, 0.06)) return;
    this.resume();
    const now = this.ctx.currentTime;

    if (type === 'archer') {
      // Snappy bowstring pluck (quick triangle)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'mage') {
      // Mystic frequency-sweep zap
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.25);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'ballista') {
      // Heavy mechanical thud with deep whoosh
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'priest') {
      // Resonant bell chime
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now); // G5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfxGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);
    }
  }

  public playHit() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('hit', 0.05)) return;
    if (this.tooSoon('hit', 0.05)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playDeath() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('death', 0.05)) return;
    if (this.tooSoon('death', 0.05)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playBuy() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('buy')) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playError() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('error')) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  // Ascending arpeggio for Merge (восходящее арпеджио)
  public playMerge() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('merge')) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25]; // C4, E4, G4, C5, E5
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.07;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.26);
    });
  }

  // Boss spawn: deep ominous horn/rumble
  public playBossSpawn() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('boss')) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65.41, now); // C2
    osc1.frequency.linearRampToValueAtTime(55.0, now + 1.2);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(68.0, now); // Detuned beat

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.6);
    osc2.stop(now + 1.6);
  }

  // Victory fanfare
  public playVictory() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('victory')) return;
    const now = this.ctx.currentTime;
    const notes = [
      { f: 293.66, t: 0, d: 0.18 }, // D4
      { f: 349.23, t: 0.18, d: 0.18 }, // F4
      { f: 440.0, t: 0.36, d: 0.18 }, // A4
      { f: 587.33, t: 0.54, d: 0.8 }, // D5
    ];

    notes.forEach((n) => {
      const startTime = now + n.t;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + n.d);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(startTime);
      osc.stop(startTime + n.d + 0.05);
    });
  }

  // Defeat sting
  public playDefeat() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    if (this.playSample('defeat')) return;
    const now = this.ctx.currentTime;
    const notes = [
      { f: 293.66, t: 0, d: 0.25 },
      { f: 277.18, t: 0.25, d: 0.25 },
      { f: 261.63, t: 0.5, d: 0.25 },
      { f: 220.0, t: 0.75, d: 0.8 },
    ];

    notes.forEach((n) => {
      const startTime = now + n.t;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, startTime);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + n.d);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(startTime);
      osc.stop(startTime + n.d + 0.05);
    });
  }
}

export const sound = new SoundEngine();
