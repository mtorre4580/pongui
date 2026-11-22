// Progreso guardado en el navegador (localStorage). Si no está disponible, el juego igual funciona.
const KEY = 'rebotin.save.v1';

export interface LevelRecord {
  stars: number;
  bestTime: number;
}

export interface SaveData {
  unlocked: number; // índice del último nivel desbloqueado
  levels: Record<string, LevelRecord>;
  sound: boolean;
}

const fresh = (): SaveData => ({ unlocked: 0, levels: {}, sound: true });
let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    cache = fresh();
  }
  return cache!;
}

export function persist(mutate: (s: SaveData) => void) {
  const s = loadSave();
  mutate(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado o almacenamiento bloqueado */
  }
}

export function recordWin(levelId: string, levelIndex: number, stars: number, time: number, total: number) {
  persist((s) => {
    const prev = s.levels[levelId];
    s.levels[levelId] = {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestTime: Math.min(prev?.bestTime ?? Infinity, time),
    };
    s.unlocked = Math.min(total - 1, Math.max(s.unlocked, levelIndex + 1));
  });
}
