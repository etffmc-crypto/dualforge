export function sendKey(vk: number, down: boolean): void;
export function sendMouseButton(button: 0 | 1 | 2, down: boolean): void;
export function sendMouseMove(dx: number, dy: number): void;
export function foregroundProcessName(): string;
export function foregroundElevated(): boolean | null;
export function selfElevated(): boolean | null;
