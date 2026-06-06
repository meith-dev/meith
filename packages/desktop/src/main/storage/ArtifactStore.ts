import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ArtifactInfo {
  id: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
}

/**
 * Stores binary artifacts (screenshots, captures) under
 * `<userData>/artifacts/`. Files are content-addressed by a caller-supplied id
 * plus extension so they can be referenced from tool results and the UI.
 */
export class ArtifactStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "artifacts");
  }

  get directory(): string {
    return this.dir;
  }

  /** Persist bytes and return the absolute path written. */
  write(id: string, ext: string, data: Buffer): ArtifactInfo {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const fileName = `${id}.${ext.replace(/^\./, "")}`;
    const path = join(this.dir, fileName);
    writeFileSync(path, data);
    return { id, path, sizeBytes: data.byteLength, createdAt: Date.now() };
  }

  list(): ArtifactInfo[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).map((name) => {
      const path = join(this.dir, name);
      const st = statSync(path);
      return {
        id: name.replace(/\.[^.]+$/, ""),
        path,
        sizeBytes: st.size,
        createdAt: st.birthtimeMs || st.mtimeMs,
      };
    });
  }
}
