type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface CheckResult {
  check: 'site' | 'release' | 'ci';
  ok: boolean;
  details: string;
  tag?: string;
  verifiedTag?: string | null;
}
export interface WatchdogDeps {
  fetch: FetchLike;
  repo: string;
  token?: string | undefined;
  pagesUrl?: string | undefined;
  lastVerifiedTag?: string | null;
  now?: () => string;
}
export const LABEL: string;
export const CHECKS: string[];
export function issueTitle(check: string): string;
export function parseLatestYml(text: string): {
  version?: string;
  path?: string;
  sha512?: string;
  size?: number;
};
export function hashFromSums(text: string, name: string): string | null;
export function checkSite(fetch: FetchLike, url: string): Promise<CheckResult>;
export function checkRelease(d: WatchdogDeps): Promise<CheckResult>;
export function checkCi(d: WatchdogDeps): Promise<CheckResult>;
export function syncIssues(d: WatchdogDeps, results: CheckResult[]): Promise<string[]>;
export function runWatchdog(
  d: WatchdogDeps,
): Promise<{ results: CheckResult[]; verifiedTag: string | null }>;
