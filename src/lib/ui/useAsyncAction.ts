"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import type { Fail } from "@/lib/actions/result";

/** How a run ended. A write action's `{ success, ... }` result already fits. */
export type Outcome = { success: true; message?: string } | Fail;

export interface AsyncActionState {
  pending: boolean;
  error: string | null;
  /** Success text from the last run's `{ success: true, message }`, if any. */
  message: string | null;
}

export type AsyncActionEvent =
  | { type: "start" }
  | { type: "settle"; outcome: Outcome; keepPendingOnSuccess?: boolean }
  | { type: "clear" };

export const IDLE: AsyncActionState = { pending: false, error: null, message: null };

/** The hook's state machine, kept pure so it can be tested without a DOM. */
export function reduceOutcome(prev: AsyncActionState, event: AsyncActionEvent): AsyncActionState {
  switch (event.type) {
    case "start":
      return { pending: true, error: null, message: null };
    case "settle":
      return event.outcome.success
        ? { pending: !!event.keepPendingOnSuccess, error: null, message: event.outcome.message ?? null }
        : { pending: false, error: event.outcome.error, message: null };
    case "clear":
      return { ...prev, error: null, message: null };
  }
}

/**
 * Run `fn` and fold every way it can end into an Outcome: a returned result
 * as-is, `void` as success, a throw as `fallbackError`. The thrown message is
 * never used — in production Next.js replaces it with a redaction notice.
 */
export async function settle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Outcome | void>,
  args: Args,
  fallbackError: string,
): Promise<Outcome> {
  try {
    return (await fn(...args)) ?? { success: true };
  } catch {
    return { success: false, error: fallbackError };
  }
}

export interface AsyncActionOptions {
  /** Error text when `fn` throws (network drop, REST failure, a parent callback). */
  fallbackError?: string;
  onSuccess?: (message?: string) => void;
  /** For a caller whose error slot is shared with other sources: write it there. */
  onError?: (error: string) => void;
  /** Leave `pending` set after a success — for a dialog that closes on success,
   *  so its button stays disabled through the exit animation. */
  keepPendingOnSuccess?: boolean;
}

/**
 * The pending / error / success-message boilerplate around one async write.
 * No debouncing and no race handling: a second run while one is in flight
 * behaves as it would with hand-written state (callers disable the button).
 * `run` is stable and always calls the latest `fn` and options.
 */
export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Outcome | void>,
  opts: AsyncActionOptions = {},
) {
  const [state, dispatch] = useReducer(reduceOutcome, IDLE);
  const latestRef = useRef({ fn, opts });
  useLayoutEffect(() => {
    latestRef.current = { fn, opts };
  });
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(async (...args: Args): Promise<boolean> => {
    const { fn, opts } = latestRef.current;
    dispatch({ type: "start" });
    const outcome = await settle(fn, args, opts.fallbackError ?? "");
    if (mountedRef.current) {
      dispatch({ type: "settle", outcome, keepPendingOnSuccess: opts.keepPendingOnSuccess });
    }
    if (outcome.success) opts.onSuccess?.(outcome.message);
    else opts.onError?.(outcome.error);
    return outcome.success;
  }, []);

  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  return { ...state, run, clear };
}
