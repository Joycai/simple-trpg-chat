"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { uploadAvatarAction } from "@/app/actions/room";

/**
 * The member's avatar image in the character panel: a picked file goes to the
 * cropper (`cropFile`), and `confirmCrop` uploads the result. `avatarSrc`
 * reflects a just-cropped image instantly, before router.refresh propagates
 * the new value down through props.
 */
export function useCharacterAvatarUpload(roomId: number, avatar: string | null | undefined) {
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<{ source: typeof avatar; image: string } | null>(null);
  // An optimistic upload only masks the prop it replaced. Later saves (including
  // AI-generated avatars) must win when their new reference arrives.
  const avatarSrc = avatarOverride && avatarOverride.source === avatar ? avatarOverride.image : avatar ?? null;

  const confirmCrop = async (dataUrl: string) => {
    const res = await uploadAvatarAction(roomId, dataUrl)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    // ImageCropper shows a thrown Error's message in its own error strip
    // and stays open — a local signal, not a server error crossing the wire.
    if (!res.success) throw new Error(res.error);
    setAvatarOverride({ source: avatar, image: dataUrl });
    setCropFile(null);
    router.refresh();
  };

  return { cropFile, setCropFile, avatarSrc, confirmCrop };
}
