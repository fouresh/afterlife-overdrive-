/** Graphics preferences of this device (localStorage; defaults when storage is unavailable). */
class GfxPrefs {
  /** Dynamic lighting (light map pass). Off on weak phones if the game stutters. */
  lighting = true;

  constructor() {
    try {
      this.lighting = localStorage.getItem('ao.lighting') !== '0';
    } catch {
      /* storage unavailable */
    }
  }

  setLighting(on: boolean): void {
    this.lighting = on;
    try {
      localStorage.setItem('ao.lighting', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
}

export const gfx = new GfxPrefs();
