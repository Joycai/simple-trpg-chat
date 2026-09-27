"use client";

import { useEffect, useRef, useState } from "react";
import { getCharacterDataAction } from "@/app/actions/character";
import type { CharacterData } from "@/lib/character/types";
import { characterCache, setCacheEntry } from "./character-cache";

/**
 * The resource tooltip on a chat avatar: hover intent, the sender's sheet
 * (fetched once per sender through the shared cache), and the tooltip's
 * position, kept in step with scrolling and resizing. `canView` gates it to
 * members the viewer may inspect.
 */
export function useAvatarHoverCard({
  roomId,
  senderId,
  canView,
}: {
  roomId: number | undefined;
  senderId: number | undefined;
  canView: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  // Hover-intent timer: the tooltip only mounts if the cursor rests on the
  // avatar for 120ms, so sweeping the cursor down the avatar column doesn't
  // replay the enter animation on every message.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isHovered || !canView) return;

    const updatePosition = () => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.right + 8,
        });
      }
    };

    updatePosition();

    // rAF-throttled like the main chat scroll handler: the raw scroll event
    // fires several times per frame, and each updatePosition is a forced
    // layout (getBoundingClientRect) plus a React commit on this message.
    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    // Find nearest scrollable container
    const scrollParent = avatarRef.current?.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", scheduleUpdate);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", scheduleUpdate);
      }
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [isHovered, canView]);

  const handleMouseEnter = () => {
    // Hover intent: delay the tooltip mount; the data prefetch below stays
    // immediate (fetching early is harmless).
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
    if (!canView || !roomId || !senderId) return;

    const cacheKey = `${roomId}-${senderId}`;
    const cached = characterCache.get(cacheKey);

    if (cached) {
      if (cached.promise) {
        setLoading(true);
        cached.promise.then((data) => {
          setCharData(data);
          setLoading(false);
        });
      } else {
        setCharData(cached.data);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const promise = getCharacterDataAction(roomId, senderId)
      .then((data) => {
        setCacheEntry(cacheKey, { data, promise: undefined });
        return data;
      })
      .catch((err) => {
        console.error("Failed to fetch character data for tooltip:", err);
        characterCache.delete(cacheKey);
        return null;
      });

    setCacheEntry(cacheKey, { data: null, promise });

    promise.then((data) => {
      setCharData(data);
      setLoading(false);
    });
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setIsHovered(false);
  };

  return { avatarRef, isHovered, charData, loading, coords, handleMouseEnter, handleMouseLeave };
}
