import { mkdir, access, constants } from 'fs/promises';
import { join } from 'path';

export async function ensureDirectoryExists(directoryPath: string): Promise<void> {
  try {
    await access(directoryPath, constants.F_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(directoryPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

export function getContentDirectory(
  basePath: string,
  sessionId: string,
  contentId: string
): string {
  return join(basePath, 'chunks', sessionId, contentId);
}

export function getChunkPath(
  basePath: string,
  sessionId: string,
  contentId: string,
  chunkIndex: number
): string {
  return join(getContentDirectory(basePath, sessionId, contentId), `${chunkIndex}.bin`);
}

export function getMetadataPath(
  basePath: string,
  sessionId: string,
  contentId: string
): string {
  return join(getContentDirectory(basePath, sessionId, contentId), 'meta.json');
}

export function getSessionPath(basePath: string, sessionId: string): string {
  return join(basePath, 'sessions', sessionId);
}

export function getDatabasePath(basePath: string, sessionId: string): string {
  return join(getSessionPath(basePath, sessionId), 'metadata.db');
}
