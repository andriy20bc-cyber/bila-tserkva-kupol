const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ BOT_TOKEN не заданий");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🛰 БІЛОЦЕРКІВСЬКИЙ КУПОЛ\n\nОберіть розділ:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗺 Моніторинг",
              web_app: {
                url: "https://YOUR-MAP-URL"
              }
            }
          ]
        ]
      }
    }
  );
});

console.log("🤖 Бот запущений");
