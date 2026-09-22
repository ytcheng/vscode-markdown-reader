export class SlugGenerator {
  readonly #counts = new Map<string, number>();

  slug(text: string): string {
    const base = text
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    const count = this.#counts.get(base) ?? 0;

    this.#counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}
