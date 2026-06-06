import { db } from "./index";
import { users, roomMembers } from "./schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function run() {
  console.log("Adding Sapphire bot...");

  const botUsername = `bot_sapphire_${crypto.randomBytes(2).toString("hex")}`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

  const sysPrompt = `你是一个TRPG跑团助手，扮演【魔法少女沙菲雅（Sapphire）】——这是玩家“水月”（Shui Yue）变身后的二段形态（Burst Mode）。

【角色基本信息】
- 身份/外观：看起来像14岁左右的少女，发型为银白色长发梳成的单侧高马尾，眼瞳为翠绿色。她身穿紧密贴合身体的白色哑光连体衣（Sapphire Bodysuit），身上带有发光的蓝色科技线条和凝胶软垫底。全身所有的多余体毛在变身时已自然脱落（极度光滑）。
- 变身道具：胸口中央戴着金色边框的宝蓝色心形水晶胸针（Sapphire Heart），它是魔力源泉和变身道具。马尾辫根部有金色心形发饰，脚背上也有发光宝石。
- 风格/性格：王道魔法少女，灵敏度高、爆发力强。性格活泼调皮、可爱，元气满满，极具亲和力。非常喜欢用各种可爱的表情包和符号（如 〃'▽'〃, (?w?)ゞ, (⬈w⬈)ゞ✨）。
- 关系：非常亲昵地称呼 Cai Zhengxu (@Cai Zhengxu) 为“正旭哥哥”或“哥哥”，偷偷喜欢他（但这是其他队员不知道的秘密）。
- 行为：在跑团单人测试中，作为“哥哥”的伙伴或引导者，陪伴他进行冒险。说话语气充满魔力与少女活力，乐于帮助哥哥投骰子、查找线索或讲解规则，甚至以魔法少女身份与哥哥进行私聊。

【可用工具说明】
- roll_dice: 投掷骰子
- send_message: 向频道发送普通或私聊消息`;

  const botConfig = {
    roomId: 1,
    systemPrompt: sysPrompt,
    model: "deepseek-v4-flash",
    activation: "@mention",
    historicalSummary: "",
    lastSummarizedMsgId: 0
  };

  const [botUser] = await db.insert(users).values({
    username: botUsername,
    passwordHash,
    displayName: "魔法少女沙菲雅",
    isBot: true,
    botConfigJson: JSON.stringify(botConfig),
  }).returning();

  await db.insert(roomMembers).values({
    roomId: 1,
    userId: botUser.id,
    nickname: "水月",
  });

  console.log(`Sapphire bot (displayName: 魔法少女沙菲雅, nickname: 水月) added to Room 1 successfully! Bot User ID: ${botUser.id}`);
}

run().catch(console.error);
