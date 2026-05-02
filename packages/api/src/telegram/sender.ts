import type { Bot } from "grammy";

let _bot: Bot | null = null;

export function initSender(bot: Bot) {
  _bot = bot;
}

/**
 * Envia uma mensagem de texto proativa para um chat Telegram.
 * Retorna o message_id se tiver sucesso.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<number> {
  if (!_bot) throw new Error("Bot não inicializado");

  const chunks = splitMessage(text);
  let lastMsgId = 0;

  for (const chunk of chunks) {
    const msg = await _bot.api
      .sendMessage(Number(chatId), chunk, { parse_mode: "Markdown" })
      .catch(() => _bot!.api.sendMessage(Number(chatId), chunk));
    lastMsgId = msg.message_id;
  }

  return lastMsgId;
}

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}
