import { parseLevel, type LevelData, type ParsedLevel } from '../game/level';

const modules = import.meta.glob<LevelData>('./*.json', { eager: true, import: 'default' });

export const LEVELS: ParsedLevel[] = Object.keys(modules)
  .sort()
  .map((k) => parseLevel(modules[k]));

export const WORLD_NAME = 'Mundo 1 · Valle Saltarín';
