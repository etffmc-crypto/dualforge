import { app } from 'electron';
import { acquireSingleInstance } from './single-instance.js';

/** Evaluated first (index.ts imports it before the logger), so a second instance leaves before doing anything. */
export const hasInstanceLock = acquireSingleInstance(app);
