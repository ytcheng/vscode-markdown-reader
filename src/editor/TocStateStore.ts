export interface TocState {
  tocVisible: boolean;
  collapsedSlugs: string[];
}

interface Storage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

const KEY = 'markdownReader.tocStates.v1';

export class TocStateStore {
  readonly #states = new Map<string, TocState>();
  #writes = Promise.resolve();

  constructor(private readonly storage?: Storage) {
    const saved = storage?.get<unknown>(KEY);
    if (!Array.isArray(saved)) return;
    for (const entry of saved.slice(-100)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
      const state = entry[1] as Partial<TocState> | undefined;
      if (!state || typeof state.tocVisible !== 'boolean' || !Array.isArray(state.collapsedSlugs)) continue;
      if (state.collapsedSlugs.length > 200 || !state.collapsedSlugs.every((slug) => typeof slug === 'string' && slug.length <= 1024)) continue;
      this.#states.set(entry[0], { tocVisible: state.tocVisible, collapsedSlugs: [...state.collapsedSlugs] });
    }
  }

  get(uri: string): TocState | undefined {
    const state = this.#states.get(uri);
    return state ? { ...state, collapsedSlugs: [...state.collapsedSlugs] } : undefined;
  }

  set(uri: string, state: TocState): Promise<void> {
    const previous = this.#states.get(uri);
    if (previous?.tocVisible === state.tocVisible && JSON.stringify(previous.collapsedSlugs) === JSON.stringify(state.collapsedSlugs)) return this.#writes;
    this.#states.delete(uri);
    this.#states.set(uri, { tocVisible: state.tocVisible, collapsedSlugs: [...state.collapsedSlugs] });
    if (this.#states.size > 100) this.#states.delete(this.#states.keys().next().value!);
    const snapshot = [...this.#states];
    this.#writes = this.#writes.catch(() => undefined).then(async () => { await this.storage?.update(KEY, snapshot); });
    return this.#writes;
  }
}
