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
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = maxLen;

    // Try to split on double newline (paragraph break)
    const lastDoubleNewline = remaining.lastIndexOf("\n\n", maxLen);
    if (lastDoubleNewline > maxLen * 0.7) {
      splitIdx = lastDoubleNewline + 2;
    } else {
      // Try to split on single newline
      const lastNewline = remaining.lastIndexOf("\n", maxLen);
      if (lastNewline > maxLen * 0.7) {
        splitIdx = lastNewline + 1;
      } else {
        // Try to split on sentence boundary (. ! ?)
        for (const punct of [".", "!", "?"]) {
          const lastPunct = remaining.lastIndexOf(punct, maxLen);
          if (lastPunct > maxLen * 0.7) {
            splitIdx = lastPunct + 1;
            break;
          }
        }
      }
    }

    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}
