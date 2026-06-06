import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Logger } from "./Logger.js";

/**
 * STUB project manager. Tracks opened project roots (cwd). A real version would
 * read package.json/templates, detect frameworks, and coordinate with
 * DevServerService + TerminalService.
 */
export interface Project {
  id: string;
  name: string;
  cwd: string;
}

export class ProjectService {
  private projects = new Map<string, Project>();

  constructor(private readonly logger: Logger) {}

  open(cwd: string): Project {
    if (!existsSync(cwd)) {
      this.logger.warn("Project", `open(): path does not exist: ${cwd}`);
    }
    const project: Project = {
      id: `proj_${Math.random().toString(16).slice(2, 10)}`,
      name: basename(cwd) || cwd,
      cwd,
    };
    this.projects.set(project.id, project);
    this.logger.info("Project", `opened project ${project.name} (${cwd})`);
    return project;
  }

  list(): Project[] {
    return [...this.projects.values()];
  }
}
