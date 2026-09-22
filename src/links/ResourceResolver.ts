import path from 'node:path';
import * as vscode from 'vscode';

export interface ResolvedResource {
  uri: vscode.Uri;
  fragment?: string;
}

export class ResourceResolver {
  constructor(private readonly workspace: typeof vscode.workspace = vscode.workspace) {}

  resolve(documentUri: vscode.Uri, href: string): ResolvedResource | undefined {
    const [pathPart, fragment] = splitFragment(href);
    const decodedPath = decodePath(pathPart);
    if (decodedPath === undefined || path.posix.isAbsolute(decodedPath)) return undefined;

    const documentDirectory = vscode.Uri.joinPath(documentUri, '..');
    const target = vscode.Uri.joinPath(documentDirectory, ...decodedPath.split('/'));
    const allowedRoot = this.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentDirectory;
    if (!isWithin(allowedRoot, target)) return undefined;

    return { uri: target, fragment };
  }
}

function splitFragment(href: string): [string, string | undefined] {
  const index = href.indexOf('#');
  return index === -1 ? [href, undefined] : [href.slice(0, index), href.slice(index + 1)];
}

function decodePath(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isWithin(root: vscode.Uri, candidate: vscode.Uri): boolean {
  if (root.scheme !== candidate.scheme || root.authority !== candidate.authority) return false;
  const relative = path.posix.relative(path.posix.normalize(root.path), path.posix.normalize(candidate.path));
  return relative === '' || (!relative.startsWith('../') && relative !== '..' && !path.posix.isAbsolute(relative));
}
