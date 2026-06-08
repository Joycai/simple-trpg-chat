import { AdminAiToggle } from "@/components/AdminAiToggle";

export default function AdminAiPage() {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-purple-100">AI 配置</h1>
        <p className="text-sm text-purple-400/60 mt-1">管理 AI Bot 功能的全局开关和设置</p>
      </div>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          AI 功能开关
        </h3>
        <AdminAiToggle initialEnabled={false} />
      </section>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          使用说明
        </h3>
        <div className="text-sm text-purple-300/70 space-y-2">
          <p>1. 开启 AI 功能后，Host 可以在房间中配置自己的 AI API</p>
          <p>2. 支持的 API：OpenAI、DeepSeek、Claude 等兼容接口</p>
          <p>3. Host 可以创建 AI Bot 作为 NPC 参与跑团</p>
          <p>4. AI 智能导入功能需要 AI 已启用</p>
        </div>
      </section>
    </div>
  );
}
