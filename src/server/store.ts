import fs from 'node:fs/promises';
import path from 'node:path';
import { validateStoreJson } from '../shared/csvImport.js';
import type { LifelineStore } from '../shared/types.js';
import { createEmptyStore } from '../shared/utilities.js';

export interface StoreRepository {
  load: () => Promise<LifelineStore>;
  save: (store: LifelineStore) => Promise<LifelineStore>;
  update: (updater: (current: LifelineStore) => LifelineStore) => Promise<LifelineStore>;
}

export function createStoreRepository(dataDir: string): StoreRepository {
  const filePath = path.join(dataDir, 'lifeline.json');
  const tempPath = path.join(dataDir, 'lifeline.json.tmp');
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function ensureDir(): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
  }

  async function loadUnlocked(): Promise<LifelineStore> {
    await ensureDir();
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return validateStoreJson(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const initial = createEmptyStore();
        await saveUnlocked(initial);
        return initial;
      }
      throw error;
    }
  }

  async function saveUnlocked(store: LifelineStore): Promise<LifelineStore> {
    await ensureDir();
    const next: LifelineStore = {
      ...store,
      updatedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(next, null, 2);
    await fs.writeFile(tempPath, json, 'utf8');
    await fs.rename(tempPath, filePath);
    return next;
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => undefined);
    return run;
  }

  return {
    load: () => enqueue(loadUnlocked),
    save: (store) => enqueue(() => saveUnlocked(store)),
    update: (updater) =>
      enqueue(async () => {
        const current = await loadUnlocked();
        const next = updater(current);
        return saveUnlocked(next);
      }),
  };
}
