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

export function formatAsMarkdown(data: ExportRoomData): string {
  const lines: string[] = [];

  lines.push(`# 房间「${data.roomName}」回放记录`);
  lines.push("");
  lines.push("## 基本信息");
  lines.push(`- 规则模版：${data.ruleTemplate === "coc7th" ? "COC 7th" : "通用 d100"}`);
  lines.push(`- 投点规则：${data.diceRules}`);
  lines.push(`- 导出时间：${data.exportTime}`);
  lines.push("");

  lines.push("## 📜 公频时间线");
  lines.push("");
  for (const item of data.timeline) {
    const time = item.time.slice(11, 19);
    const name = item.nickname || `#${item.userId}`;

    if (item.type === "dice") {
      lines.push(`[${time}] 🎲 **${name}**：${item.content || ""}`);
    } else if (item.type === "system") {
      lines.push(`[${time}] 📢 系统：${item.content || ""}`);
    } else if (item.type === "clue") {
      lines.push(`[${time}] 🃏 **${name}** 推送了线索`);
    } else if (item.type === "check_request") {
      lines.push(`[${time}] 🎯 **${name}**：${item.content || ""}`);
    } else {
      lines.push(`[${time}] 👤 **${name}**：${item.content || ""}`);
    }
  }
  lines.push("");

  if (Object.keys(data.privateConversations).length > 0) {
    lines.push("## 🔒 私聊记录");
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
        lines.push(`[${time}] 👤 **${name}**：${item.content || ""}`);
      }
      lines.push("");
    }
  }

  if (data.characterSnapshots.length > 0) {
    lines.push("## 👤 角色状态快照");
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
