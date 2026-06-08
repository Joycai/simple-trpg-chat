"use client";

import { useState, useEffect } from "react";
import { createClueAction, pushClueToChannelAction, getVisibleCluesAction } from "@/app/actions/clue";
import { useRouter } from "next/navigation";

interface ClueItem {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  type: "clue";
  createdAt: string;
}

interface ClueManagerProps {
  roomId: number;
  isHost: boolean;
  players: { id: number; nickname: string }[];
  onClose: () => void;
}

export function ClueManager({ roomId, isHost, players, onClose }: ClueManagerProps) {
  const [clues, setClues] = useState<ClueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pushTarget, setPushTarget] = useState<number | "all" | null>(null);
  const [pushClueId, setPushClueId] = useState<number | null>(null);
  const router = useRouter();

  const loadClues = async () => {
    try {
      const data = await getVisibleCluesAction(roomId);
      setClues((data as any[]).map((d: any) => d.clue || d) as ClueItem[]);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadClues(); }, [roomId]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createClueAction(roomId, title.trim(), content.trim());
    setTitle(""); setContent(""); setShowCreate(false);
    router.refresh(); loadClues();
  };

  const handlePush = async (clueId: number, target: "all" | number) => {
    const clue = clues.find(c => c.id === clueId);
    if (!clue) return;
    const targets = target === "all" ? undefined : [target as number];
    try {
      await pushClueToChannelAction(roomId, clue.title, clue.content, undefined, targets, clue.id);
      setPushClueId(null); setPushTarget(null);
      router.refresh();
    } catch { /* push failed, keep dialog open */ }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative ml-auto w-96 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">🃏 线索管理</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {isHost && !showCreate && (
            <button onClick={() => setShowCreate(true)}
              className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-theme font-bold transition">
              ＋ 创建新线索
            </button>
          )}

          {showCreate && (
            <div className="bg-surface-alt rounded-theme p-4 border border-border flex flex-col gap-3">
              <h4 className="font-bold text-text text-sm">创建线索</h4>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="线索标题" className="p-2 border border-input-border bg-input-bg rounded text-text text-sm" autoFocus />
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="线索内容（支持 Markdown）" rows={4}
                className="p-2 border border-input-border bg-input-bg rounded text-text text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 text-text-muted text-sm">取消</button>
                <button onClick={handleCreate} disabled={!title}
                  className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-2 rounded font-bold text-sm">创建</button>
              </div>
            </div>
          )}

          {/* Push dialog */}
          {pushClueId !== null && (
            <div className="bg-accent/10 border border-accent/30 rounded-theme p-4">
              <h4 className="font-bold text-text text-sm mb-3">推送线索到频道</h4>
              <div className="flex flex-col gap-2 mb-3">
                <button onClick={() => handlePush(pushClueId, "all")}
                  className="bg-accent hover:bg-accent-hover text-white py-2 rounded font-bold text-sm">🌐 全员可见</button>
                {players.map(p => (
                  <button key={p.id} onClick={() => handlePush(pushClueId, p.id)}
                    className="bg-surface hover:bg-surface-alt text-text py-2 px-3 rounded text-sm text-left transition">
                    👤 {p.nickname}
                  </button>
                ))}
              </div>
              <button onClick={() => setPushClueId(null)} className="text-xs text-text-muted hover:text-text">取消</button>
            </div>
          )}

          {/* Clue list */}
          <div>
            <h4 className="text-xs text-text-dim font-medium mb-2 uppercase tracking-wider">
              {isHost ? "所有线索" : "我的线索"}
            </h4>
            {clues.length === 0 ? (
              <p className="text-sm text-text-muted py-8 text-center">
                {isHost ? "还没有创建线索" : "暂无线索"}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {clues.map(clue => (
                  <div key={clue.id} className="bg-surface-alt rounded-theme p-3 border border-border">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-bold text-text flex items-center gap-2">
                          🃏 {clue.title}
                        </h5>
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">{clue.content.slice(0, 120)}</p>
                      </div>
                      {isHost && (
                        <button onClick={() => setPushClueId(clue.id)}
                          className="ml-2 bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs font-bold shrink-0">
                          推送
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
