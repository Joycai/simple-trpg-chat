import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import zh from "../../messages/zh.json";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import { RuleTemplateProvider } from "@/components/shared/host-label";
import { ChatInput } from "@/components/room/chat/ChatInput";
import { RoomTopBar } from "@/components/room/RoomTopBar";
import { useOverlayVisibility } from "@/components/room/hooks/useOverlayVisibility";
import { HostCheckDialog } from "@/components/room/chat/HostCheckDialog";
import { TimelineDividerDialog } from "@/components/room/chat/TimelineDividerDialog";
import { BonusDicePrompt } from "@/components/room/chat/BonusDicePrompt";
import { SkillSetPrompt } from "@/components/room/character/SkillSetPrompt";
import { CreateEditModal } from "@/components/room/inventory/modals/CreateEditModal";
import { DEFAULT_ITEM_META } from "@/components/room/inventory/inventory-types";
import { NotebookCategoryList } from "@/components/room/notebook/NotebookCategoryList";
import { TimelineDivider } from "@/components/room/chat/TimelineDivider";
import { SidebarResizeHandle } from "@/components/room/SidebarControls";
import { useSidebar } from "@/components/room/hooks/useSidebar";
import type { CheckMode, Room } from "@/components/room/types";

const noop = () => {};
const players = Array.from({ length: 16 }, (_, id) => ({ id: id + 1, nickname: `Player ${id + 1}` }));
const room: Room = { id: 1, name: "Responsive Room", hostId: 1, secretKey: "fixture", status: "active", theme: "default", ruleTemplate: "coc7th" };

function Harness() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get("scenario") ?? "chat";
  const overlays = useOverlayVisibility();
  const sidebar = useSidebar();
  const [sent, setSent] = useState("");
  const [open, setOpen] = useState(true);
  const [checkMode, setCheckMode] = useState<CheckMode | null>(null);
  const [checkMenu, setCheckMenu] = useState(false);
  const [title, setTitle] = useState("Clue");
  const [fields, setFields] = useState({ text: "A clue", basicInfo: "", detail: "", appearance: "", extra: "" });
  const [meta, setMeta] = useState(DEFAULT_ITEM_META);
  const [itemType, setItemType] = useState<"clue" | "info" | "character" | "item">("clue");
  const [updated, setUpdated] = useState("");
  const close = () => setOpen(false);
  const closed = <output data-testid="closed">closed</output>;

  if (scenario === "chat") return <div className="flex flex-col h-dvh">
    <div className="flex-1" /><div className="px-4 py-3"><ChatInput roomId={1} onSendMessage={setSent}
      quickCommands={[".r d100", ".r d20"]} isPrivateLocked={params.get("dm") === "1"} /></div>
    <output data-testid="sent">{sent}</output>
  </div>;
  if (scenario === "toolbar") return <>
    <RoomTopBar room={room} isHost nickname="Host" status="connected" hasBackground
      checkMenuModes={["check", "psychology", "sancheck"]} playerCount={16} onlineCount={16} botCount={1}
      sidebarCollapsed totalUnread={0} onToggleSidebar={noop} editingRoomName={false} roomNameDraft={room.name}
      savingRoomName={false} setRoomNameDraft={noop} setEditingRoomName={noop} onSaveRoomName={noop}
      unreadItems={0} onToggleInventory={noop} unreadEvents={0} checkMode={checkMode} setCheckMode={setCheckMode}
      showCheckMenu={checkMenu} setShowCheckMenu={setCheckMenu} overlays={overlays} onOpenHotkeyHelp={noop} />
    <output data-testid="selection">{checkMode}{overlays.shown.itemManager ? "itemManager" : ""}</output>
  </>;
  if (scenario === "editor") return open ? <CreateEditModal roomId={1} editingItemId={null} itemType={itemType}
    onItemTypeChange={setItemType} title={title} onTitleChange={setTitle} contentFields={fields}
    onContentFieldsChange={setFields} meta={meta} onMetaChange={setMeta} imageUrl={null} onImageChange={noop}
    onCancel={close} onSubmit={async () => { setSent(fields.text); return true; }} /> : <>{closed}<output data-testid="sent">{sent}</output></>;
  if (scenario === "host-check") return open ? <HostCheckDialog roomId={1} players={players} onClose={close}
    mode={params.get("mode") === "sancheck" ? "sancheck" : "check"} /> : closed;
  if (scenario === "timeline-dialog") return open ? <TimelineDividerDialog roomId={1} onClose={close} /> : closed;
  if (scenario === "bonus") return open ? <BonusDicePrompt max={5} onClose={close} onConfirm={close} /> : closed;
  if (scenario === "skill") return open ? <SkillSetPrompt skillName="侦查" onClose={close} onConfirm={close} /> : closed;
  if (scenario === "touch-actions") return <div className="p-4">
    <NotebookCategoryList categories={[{ id: 1, roomId: 1, userId: 1, name: "Notes", color: "accent", createdAt: "" }]}
      counts={new Map([[1, 2]])} totalCount={2} active="all" onSelect={noop} readOnly={false}
      onCreate={async () => {}} onUpdate={async (_, input) => setUpdated(input.name)} onDelete={noop} />
    <output data-testid="updated">{updated}</output>
    <TimelineDivider data={null} fallback="Day 1" isHost onWithdraw={() => setSent("withdrawn")} />
    <output data-testid="sent">{sent}</output>
  </div>;
  if (scenario === "sidebar") return <div className="flex h-dvh">
    {!sidebar.collapsed && <><aside data-testid="sidebar" style={{ width: sidebar.width }} className="shrink-0">Sidebar</aside>
      <SidebarResizeHandle onResizeStart={sidebar.handleResizeStart} onResetWidth={sidebar.resetWidth} onCollapse={() => sidebar.setCollapsed(true)} /></>}
    <main className="flex-1 min-w-0"><button onClick={sidebar.toggleCollapsed}>Toggle sidebar</button>
      <output data-testid="resizing">{String(sidebar.resizing)}</output></main>
  </div>;
  return null;
}

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "default";
document.documentElement.dataset.mode = "light";
const locale = new URLSearchParams(location.search).get("locale") === "en" ? "en" : "zh";
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zh} timeZone="Asia/Shanghai">
    <RuleTemplateProvider ruleTemplate="coc7th"><Harness /></RuleTemplateProvider>
  </NextIntlClientProvider>,
);
