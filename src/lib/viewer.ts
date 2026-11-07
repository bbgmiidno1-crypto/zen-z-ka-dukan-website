export type ViewerCommandType = 'rotateLeft' | 'rotateRight' | 'zoomIn' | 'zoomOut' | 'reset';

export interface ViewerCommand {
  type: ViewerCommandType;
  nonce: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function wrapFrame(frame: number, count: number): number {
  if (count <= 0) return 0;
  return ((frame % count) + count) % count;
}
