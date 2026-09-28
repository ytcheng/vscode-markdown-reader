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

export async function renderGraphviz(source: string): Promise<string> {
  return (await getGraphviz()).renderString(source, { format: 'svg' });
}
