export function tagMatches(tag: unknown, version: string): boolean;
export function changelogSection(md: string, version: string): string | null;
export function releaseFiles(version: string): string[];
export function sha256sums(entries: { name: string; data: string | Uint8Array }[]): string;
