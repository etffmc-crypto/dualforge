/**
 * `shell.openPath` never rejects: it resolves '' on success and an error string on failure. The renderer's
 * E_OPEN_DATA_DIR handler only runs on a rejection, so turn the string into one (and log the cause once).
 */
export async function openPathOrThrow(
  openPath: (p: string) => Promise<string>,
  path: string,
  log: { error(o: object): void },
): Promise<void> {
  const err = await openPath(path);
  if (!err) return;
  log.error({ code: 'E_OPEN_DATA_DIR', msg: err });
  throw new Error(err);
}
