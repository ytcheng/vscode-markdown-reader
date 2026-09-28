import { instance } from '@viz-js/viz';

type GraphvizInstance = Awaited<ReturnType<typeof instance>>;
let graphvizPromise: Promise<GraphvizInstance> | undefined;

function getGraphviz(): Promise<GraphvizInstance> {
  graphvizPromise ??= instance().catch((error: unknown) => {
    graphvizPromise = undefined;
    throw error;
  });
  return graphvizPromise;
}

export async function renderGraphviz(source: string, dark = false): Promise<string> {
  return normalizeGraphvizSvg((await getGraphviz()).renderString(source, {
    format: 'svg',
    graphAttributes: {
      bgcolor: 'transparent',
      ...(dark ? { fontcolor: '#e6edf3' } : {})
    },
    ...(dark ? {
      nodeAttributes: { color: '#c9d1d9', fontcolor: '#e6edf3' },
      edgeAttributes: { color: '#c9d1d9', fontcolor: '#e6edf3' }
    } : {})
  }));
}

function normalizeGraphvizSvg(svg: string): string {
  const withoutDeclaration = svg.replace(/^\uFEFF?\s*<\?xml\s+[^?]*\?>\s*/i, '');
  const withoutDoctype = withoutDeclaration.replace(
    /<!DOCTYPE\s+svg\s+PUBLIC\s+"-\/\/W3C\/\/DTD SVG 1\.1\/\/EN"\s+"http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd"\s*>/i,
    ''
  );
  return withoutDoctype.replace(
    /(<g\b(?=[^>]*\bid="graph0")(?=[^>]*\bclass="graph")[^>]*>\s*<title>[^<]*<\/title>\s*)<polygon\b(?=[^>]*\bstroke="none")[^>]*\/>/i,
    '$1'
  );
}
