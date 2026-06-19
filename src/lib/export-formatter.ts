interface ExportTimelineItem {
  time: string;
  type: string;
  nickname?: string;
  userId?: number;
  content?: string;
  targetNickname?: string;
  targetUserId?: number | null;
}

interface ExportCharacterSnapshot {
  nickname: string;
  userId: number;
  hp?: number;
  hpMax?: number;
  san?: number;
  mp?: number;
  attributes?: Record<string, number>;
}

interface ExportRoomData {
  roomName: string;
  ruleTemplate: string;
  diceRules: string;
  theme: string;
  exportTime: string;
  timeline: ExportTimelineItem[];
  privateConversations: Record<string, ExportTimelineItem[]>;
  characterSnapshots: ExportCharacterSnapshot[];
}

export function formatAsMarkdown(data: ExportRoomData, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const lines: string[] = [];

  lines.push(`# ${t("title", { roomName: data.roomName })}`);
  lines.push("");
  lines.push(`## ${t("basicInfo")}`);
  lines.push(`- ${t("ruleTemplate")}：${data.ruleTemplate === "coc7th" ? t("ruleTemplateCoc7th") : t("ruleTemplateBasic")}`);
  lines.push(`- ${t("diceRules")}：${data.diceRules}`);
  lines.push(`- ${t("exportTime")}：${data.exportTime}`);
  lines.push("");

  lines.push(`## ${t("publicTimeline")}`);
  lines.push("");
  for (const item of data.timeline) {
    const time = item.time.slice(11, 19);
    const name = item.nickname || `#${item.userId}`;

    if (item.type === "dice") {
      lines.push(`[${time}] 🎲 **${name}**：${item.content || ""}`);
    } else if (item.type === "system") {
      lines.push(`[${time}] ${t("systemPrefix")}${item.content || ""}`);
    } else if (item.type === "clue") {
      lines.push(`[${time}] ${t("cluePrefix", { name })}`);
    } else if (item.type === "check_request") {
      lines.push(`[${time}] 🎯 **${name}**：${item.content || ""}`);
    } else if (item.type === "image") {
      lines.push(`[${time}] 🖼️ **${name}**：![image](${item.content || ""})`);
    } else {
      lines.push(`[${time}] 👤 **${name}**：${item.content || ""}`);
    }
  }
  lines.push("");

  if (Object.keys(data.privateConversations).length > 0) {
    lines.push(`## ${t("privateLogs")}`);
    lines.push("");
    for (const [key, msgs] of Object.entries(data.privateConversations)) {
      if (msgs.length === 0) continue;
      const p1 = msgs[0].nickname || `#${msgs[0].userId}`;
      const p2 = msgs[0].targetNickname || `#${msgs[0].targetUserId}`;
      lines.push(`### ${p1} ↔ ${p2}`);
      lines.push("");
      for (const item of msgs) {
        const time = item.time.slice(11, 19);
        const name = item.nickname || `#${item.userId}`;
        if (item.type === "image") {
          lines.push(`[${time}] 🖼️ **${name}**：![image](${item.content || ""})`);
        } else {
          lines.push(`[${time}] 👤 **${name}**：${item.content || ""}`);
        }
      }
      lines.push("");
    }
  }

  if (data.characterSnapshots.length > 0) {
    lines.push(`## ${t("characterSnapshot")}`);
    lines.push("");
    for (const snap of data.characterSnapshots) {
      const parts: string[] = [];
      if (snap.hp !== undefined) parts.push(`HP ${snap.hp}/${snap.hpMax || snap.hp}`);
      if (snap.san !== undefined) parts.push(`SAN ${snap.san}`);
      if (snap.mp !== undefined) parts.push(`MP ${snap.mp}`);
      lines.push(`- **${snap.nickname}**：${parts.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatAsJson(data: ExportRoomData): string {
  return JSON.stringify(data, null, 2);
}
