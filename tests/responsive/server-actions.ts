// No database or real writes are involved in these layout/interaction tests.
export async function requestSkillCheckAction() { return { success: true }; }
export async function requestSanCheckAction() { return { success: true }; }
export async function psychologyHiddenRollAction() { return { success: true }; }
export async function getStickerManifestAction() {
  return [{ pack: "test", label: "Test stickers", stickers: Array.from({ length: 24 }, (_, index) => ({
    id: `sticker-${index}`,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3C/svg%3E",
  })) }];
}
export async function getMySkillsAction() { return []; }
export async function getCharacterDataAction() { return null; }
export async function insertTimelineDividerAction() { return { success: true }; }
