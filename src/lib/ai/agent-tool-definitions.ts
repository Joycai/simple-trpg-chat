import { getRule } from "@/lib/rules";
import { sheetToolSchema } from "@/lib/character/sheet-ai";

/**
 * OpenAI-style function definitions for every tool the bot agent can call.
 * Names here must match the keys of `AGENT_TOOL_HANDLERS`; `roomId` is
 * interpolated into send_image's description so the model sees this room's
 * internal image path.
 */
export function buildAgentToolDefinitions(roomId: number, ruleId?: string | null) {
  return [
    {
      type: "function",
      function: {
        name: "roll_dice",
        description: "Roll dice for the TRPG game. Limit count: 1-20, faces: 1-1000.",
        parameters: {
          type: "object",
          properties: {
            faces: { type: "integer", minimum: 1, maximum: 1000 },
            count: { type: "integer", minimum: 1, maximum: 20 },
            isPrivate: { type: "boolean" }
          },
          required: ["faces", "count"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "respond_check",
        description: "Respond to a skill/attribute/sanity check that the host has requested FROM YOU. This rolls the check properly against your own character sheet (success/failure grading, SAN loss, etc.) and marks you as 'responded' on the host's request — exactly like a player clicking the host's check message. Use this instead of roll_dice whenever the host asks you to make a check. If you have no value set for the requested skill/stat, set it first via set_character_card, then respond.",
        parameters: {
          type: "object",
          properties: {
            checkRequestId: { type: "integer", description: "Optional message id of a specific pending check request. Omit to respond to the most recent check still awaiting you." },
            bonusDice: { type: "integer", description: "Only for rules whose checks add bonus dice from the responder's own skills (狩魂者 加骰, d4 each): how many you get for this check. Ignored by other rules. Defaults to 0." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "roll_skill_check",
        description: "Proactively roll a skill/attribute check against YOUR OWN character sheet, using the room rule's `.rc` syntax (see [Room Rules] for the syntax of this room's rule). Use this when someone asks you in plain chat to make a check and there is NO formal pending check request — for a host-issued check request, use respond_check instead. If you have no value set for the skill/stat, set it first via set_character_card.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Everything after '.rc' in the room rule's check syntax — e.g. '侦查' (COC), 'b2 侦查' (COC bonus dice), '运动+5 15' (d20 modifier vs DC)." },
            isPrivate: { type: "boolean", description: "Roll privately in the current DM. Defaults to matching the channel you were triggered in." }
          },
          required: ["expression"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_members",
        description: "List this room's members with their user ids, nicknames, and roles. Use this to resolve a nickname to a userId before calling give_item or reveal_clue.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "give_item",
        description: "Give an item from YOUR inventory to another player: the item is added to their backpack and they (plus the host) are notified. You must actually possess the item (check my_inventory). You cannot give to yourself or to another bot. Use list_members to find the recipient's userId.",
        parameters: {
          type: "object",
          properties: {
            itemId: { type: "integer", description: "Id of an item you possess (see my_inventory)" },
            toUserId: { type: "integer", description: "The recipient's userId (see list_members)" }
          },
          required: ["itemId", "toUserId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "reveal_clue",
        description: "Reveal a clue card that YOU can see (check my_clues) to specific players: the clue appears in their clue list and they (plus the host) are notified. Use this when your role decides to hand game information to players. You cannot reveal to bots. Use list_members to find user ids.",
        parameters: {
          type: "object",
          properties: {
            clueId: { type: "integer", description: "Id of a clue visible to you (see my_clues)" },
            targetUserIds: { type: "array", items: { type: "integer" }, description: "userIds of the players to reveal the clue to (see list_members)" }
          },
          required: ["clueId", "targetUserIds"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_image",
        description: `Show an image in the chat. Provide an image URL — either an internal room image path (e.g. /api/rooms/${roomId}/images/...) or a public https:// image URL. Use this to illustrate a scene, handout, or object.`,
        parameters: {
          type: "object",
          properties: {
            imageUrl: { type: "string", description: "An internal room image path for this room, or a public https:// image URL" },
            isPrivate: { type: "boolean" }
          },
          required: ["imageUrl"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "inspect_item",
        description: "Read details of an item in inventory",
        parameters: {
          type: "object",
          properties: {
            itemId: { type: "integer" }
          },
          required: ["itemId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_history",
        description: "Search chat history in the current room by keyword. Use this when you need to recall past events, plot points, or information mentioned earlier in the conversation that is beyond your sliding window.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keyword or phrase to search for" },
            limit: { type: "integer", description: "Max results to return (default 10, max 20)" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "my_inventory",
        description: "List all items in your inventory. Use this to check what equipment, documents, or items you currently possess.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "my_clues",
        description: "List all clue cards that have been revealed to you in this room.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "my_character",
        description: "Check your own character sheet including attributes, HP/SAN/MP, skills, and status.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "set_character_card",
        description: "Set or update your own character sheet for this room's rule: attributes, resources, skills, and background story. Only send the fields you want to change.",
        parameters: {
          type: "object",
          properties: {
            name: { "type": "string", "description": "The character's name" },
            age: { "type": "integer", "description": "The character's age" },
            occupation: { "type": "string", "description": "The character's occupation" },
            bio: { "type": "string", "description": "The character's biography or backstory" },
            // The room rule's sheet fields (attributes, resources, role/level),
            // generated from its schema — the same schema `applySheetEdit`
            // validates the call against.
            ...sheetToolSchema(getRule(ruleId)),
            customAttributes: {
              type: "array",
              description: "Generic custom attributes/stats for non-COC systems or extensions.",
              items: {
                type: "object",
                properties: {
                  name: { "type": "string", "description": "Attribute name, e.g. 'Sanity', 'Mana', 'Strength'" },
                  value: { "type": "integer", "description": "Current value" },
                  max: { "type": "integer", "description": "Optional maximum value" }
                },
                required: ["name", "value"]
              }
            },
            skills: {
              type: "array",
              description: "Skills list to add or update.",
              items: {
                type: "object",
                properties: {
                  name: { "type": "string", "description": "Skill name, e.g. 'Spot Hidden' or 'Library Use'" },
                  value: { "type": "integer", "description": "Skill level/percentage (e.g. 50)" }
                },
                required: ["name", "value"]
              }
            }
          }
        }
      }
    }
  ];
}
