import { siteURL } from '../site-root.ts';
import type { AudioPlayer } from '../types.ts';
export class Player implements AudioPlayer {
  current: HTMLAudioElement | null = null;
  readonly cache = new Map<string, HTMLAudioElement>();
  private token = 0;
  private cancel: (() => void) | null = null;
  constructor(private readonly capacity = 8) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw Error('Audio cache capacity must be positive.');
  }
  private trim() {
    for (const [key, audio] of this.cache) {
      if (this.cache.size <= this.capacity) break;
      if (audio === this.current) continue;
      this.cache.delete(key);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }
  preload(paths: string[]) {
    for (const path of paths) {
      let audio = this.cache.get(path);
      if (!audio) {
        audio = new Audio(typeof document === 'undefined' ? path : siteURL(path).href);
        audio.preload = 'auto';
        audio.load();
      }
      this.cache.delete(path);
      this.cache.set(path, audio);
      this.trim();
    }
  }
  stop() {
    this.token++;
    this.cancel?.();
    this.cancel = null;
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
    this.trim();
  }
  async play(path: string): Promise<void> {
    this.stop();
    this.preload([path]);
    const token = this.token;
    const audio = this.cache.get(path)!;
    this.current = audio;
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.onended = null;
        audio.onerror = null;
        if (token === this.token) this.cancel = null;
        error ? reject(error) : resolve();
      };
      this.cancel = () => finish();
      timer = setTimeout(() => {
        audio.pause();
        finish(Error('Audio could not load.'));
      }, 10000);
      audio.onended = () => finish();
      audio.onerror = () => finish(Error('Recording unavailable.'));
      audio
        .play()
        .then(() => {
          if (token !== this.token || settled) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            audio.pause();
            finish(Error('Playback did not finish.'));
          }, 15000);
        })
        .catch((error) => {
          if (token === this.token) finish(error);
        });
    });
  }
}
