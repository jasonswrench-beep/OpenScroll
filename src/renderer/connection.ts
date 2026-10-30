import type { Socket } from 'node:net';
import { PDF_STATUS_BUSY } from '../project/pdf-protocol.js';

/** Reject immediately, draining unread request bytes so a normal peer receives FIN. */
export function rejectBusyConnection(socket: Socket): void {
  if (socket.destroyed) return;
  // Absolute bound: a peer withholding request EOF cannot retain a connection.
  const deadline = setTimeout(() => socket.destroy(), 1000);
  socket.once('close', () => clearTimeout(deadline));
  socket.once('error', () => socket.destroy());
  socket.resume();
  const frame = Buffer.alloc(5);
  frame.writeUInt32BE(1); frame[4] = PDF_STATUS_BUSY;
  socket.end(frame);
}
