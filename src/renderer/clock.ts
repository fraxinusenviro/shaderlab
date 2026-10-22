/**
 * Simulation clock. Several renderers can share one clock (A/B comparison):
 * advance() is idempotent per animation-frame timestamp, so each frame's
 * time is applied exactly once regardless of how many renderers tick it.
 */
export class Clock {
  time = 0;
  frame = 0;
  delta = 0;
  speed = 1;
  playing = true;
  private lastNow: number | null = null;
  private stepPending = 0;

  advance(now: number): boolean {
    if (this.lastNow === now) return false;
    const prev = this.lastNow;
    this.lastNow = now;
    if (this.stepPending > 0) {
      this.stepPending--;
      this.delta = (1 / 60) * this.speed;
      this.time += this.delta;
      this.frame++;
      return true;
    }
    if (!this.playing) {
      this.delta = 0;
      return false;
    }
    const dt = prev === null ? 0 : Math.min(0.25, (now - prev) / 1000);
    this.delta = dt * this.speed;
    this.time += this.delta;
    this.frame++;
    return true;
  }

  /** Forget the last timestamp so a resume does not jump forward. */
  resync(): void {
    this.lastNow = null;
  }

  play(): void {
    this.playing = true;
    this.resync();
  }

  pause(): void {
    this.playing = false;
  }

  restart(): void {
    this.time = 0;
    this.frame = 0;
    this.resync();
  }

  step(frames = 1): void {
    this.playing = false;
    this.stepPending += frames;
  }

  setTime(t: number): void {
    this.time = Math.max(0, t);
  }
}
