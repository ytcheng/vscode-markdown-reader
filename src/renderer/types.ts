export interface HeadingItem {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface RenderResource {
  placeholder: string;
  kind: 'image';
  href: string;
}

export interface RenderResult {
  revision: number;
  html: string;
  styles?: string;
  headings: HeadingItem[];
  resources: RenderResource[];
}
