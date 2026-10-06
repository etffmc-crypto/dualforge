export const REPO: string;
export const LIMITS: { comments: number; labels: number; pushes: number; prs: number };
export const BRANCH_RE: RegExp;
export const ALLOWED_LABELS: string[];
export const MAINTAINER_ACTIONS: string[];
export const TEMPLATES: Record<string, { vars: Record<string, string> }>;
export const MARKER: string;
export const FORBIDDEN_PATHS: RegExp[];
export function forbiddenPaths(paths: string[]): string[];
export interface Plan {
  pushes: { branch: string }[];
  prs: { branch: string; issue: number; title: string; body: string }[];
  comments: { issue: number; templateId: string; vars: Record<string, unknown> }[];
  labels: { issue: number; add: string[] }[];
}
export function validateActions(
  input: unknown,
  opts?: { token?: string | undefined },
): { ok: true; plan: Plan } | { ok: false; errors: string[] };
export function renderComment(templateId: string, vars: Record<string, unknown>): string;
export function renderPrBody(pr: { body: string; issue: number }): string;
