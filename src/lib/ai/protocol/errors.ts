import type { Usage, Wire } from './types';
export class ProtocolError extends Error {
  rawUsage?: Wire;
  constructor(public code: 'config' | 'request' | 'response' | 'upstream' | 'timeout' | 'cancelled' | 'network', message: string, public usage?: Usage, public httpStatus?: number) {
    super(message); this.name = 'ProtocolError';
  }
}
export function invalid(message: string): never { throw new ProtocolError('response', message); }
