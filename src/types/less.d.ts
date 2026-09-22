declare module 'less' {
  interface RenderOptions {
    filename?: string;
  }

  interface RenderOutput {
    css: string;
  }

  const less: {
    render(source: string, options?: RenderOptions): Promise<RenderOutput>;
  };

  export default less;
}
