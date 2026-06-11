import { type ToolDefinition, defineTool } from "@meith/protocol";
import { ToolError, okResult } from "@meith/shared";
import { z } from "zod";
import { ProjectError } from "../services/ProjectService.js";
import type { ToolDeps } from "./deps.js";

/**
 * Project management tools (Phase 7).
 *
 * These expose the real `ProjectService` through the same registry every caller
 * (CLI, renderer, agent) uses: discovering/opening existing projects, detecting
 * their framework + package manager + scripts, controlling their dev servers,
 * and generating new projects from templates (including a prewarm buffer for
 * instant "new project" flows).
 */
export function createProjectTools(deps: ToolDeps): ToolDefinition[] {
  const { projects } = deps;

  const projectList = defineTool({
    name: "project_list",
    description: "List opened/known projects with their metadata.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult({ projects: projects.list() }),
  });

  const projectDetect = defineTool({
    name: "project_detect",
    description:
      "Inspect a directory and report its name, framework, package manager, and scripts without opening it.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: z.string().min(1).describe("Directory to inspect."),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() => okResult(projects.detect(input.cwd))),
  });

  const projectOpen = defineTool({
    name: "project_open",
    description:
      "Open (or refresh) a project (folder) into a dedicated space (1:1): detect metadata, create/reuse a space named after the project, record it, open an editor workspace tab, and optionally start its dev server. Pass spaceId to open into a specific existing space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: z.string().min(1),
      spaceId: z
        .string()
        .optional()
        .describe("Open into this existing space instead of creating a new one."),
      kind: z.enum(["app", "plugin"]).optional(),
      startDevServer: z.boolean().optional(),
      devScript: z.string().optional(),
    }),
    execute: (_ctx, input) => withProjectErrors(() => okResult(projects.open(input))),
  });

  const projectStartDevServer = defineTool({
    name: "project_start_dev_server",
    description:
      "Start a project's dev server using its detected package manager and dev/start script.",
    capabilities: ["starts-process", "accesses-network"],
    inputSchema: z.object({
      projectId: z.string(),
      script: z.string().optional().describe("Script name; defaults to dev/start."),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() =>
        okResult(projects.startDevServer(input.projectId, input.script)),
      ),
  });

  const projectStopDevServer = defineTool({
    name: "project_stop_dev_server",
    description: "Stop every running dev server associated with a project.",
    capabilities: ["starts-process"],
    inputSchema: z.object({
      projectId: z.string(),
      signal: z.string().optional(),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() =>
        okResult(projects.stopDevServer(input.projectId, input.signal as NodeJS.Signals)),
      ),
  });

  const projectListTemplates = defineTool({
    name: "project_list_templates",
    description: "List the available project templates (app and plugin).",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult({ templates: projects.listTemplates() }),
  });

  const projectCreate = defineTool({
    name: "project_create",
    description:
      "Generate a new project from a template into the generated projects root (~/Documents/meith), then open it into a new dedicated space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      template: z.string().describe("Template name, e.g. 'app-basic'."),
      name: z.string().optional().describe("Directory/display name for the new project."),
      open: z.boolean().optional().describe("Open after creating (default true)."),
      startDevServer: z.boolean().optional(),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() => okResult(projects.createFromTemplate(input))),
  });

  const projectCreatePlugin = defineTool({
    name: "project_create_plugin",
    description:
      "Generate a new meith plugin project from the plugin template, then open it into a new dedicated space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      name: z.string().optional(),
      open: z.boolean().optional(),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() => okResult(projects.createPlugin(input))),
  });

  const projectPrewarm = defineTool({
    name: "project_prewarm",
    description:
      "Maintain a buffer of N ready-to-allocate app projects for instant 'new project' flows.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      count: z.number().int().positive().max(10).optional(),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() => okResult(projects.prewarm(input.count ?? 1))),
  });

  const projectPrewarmStatus = defineTool({
    name: "project_prewarm_status",
    description: "Report how many prewarmed app projects are currently buffered.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult(projects.prewarmStatus()),
  });

  const projectAllocate = defineTool({
    name: "project_allocate",
    description:
      "Allocate a ready app project (from the prewarm buffer, or generated on demand), open it into a new dedicated space, and start its dev server.",
    capabilities: ["writes-files", "starts-process", "accesses-network"],
    inputSchema: z.object({
      name: z.string().optional(),
      startDevServer: z.boolean().optional(),
    }),
    execute: (_ctx, input) =>
      withProjectErrors(() => okResult(projects.allocatePrewarmed(input))),
  });

  return [
    projectList,
    projectDetect,
    projectOpen,
    projectStartDevServer,
    projectStopDevServer,
    projectListTemplates,
    projectCreate,
    projectCreatePlugin,
    projectPrewarm,
    projectPrewarmStatus,
    projectAllocate,
  ];
}

/** Map `ProjectError` to a typed `TOOL_FAILED`; let everything else bubble. */
function withProjectErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ProjectError) {
      throw new ToolError("TOOL_FAILED", err.message);
    }
    throw err;
  }
}
