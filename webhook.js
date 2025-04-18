// webhook.js
// Firestore（ノート）を使う準備
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const axios = require('axios'); // ← ファイルの上の方に書いておく（1回だけ）
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_APP_ID = process.env.DIFY_APP_ID;


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestoreの「ノートを開く」

// Firestoreにメッセージを保存する関数
async function saveToFirestore(userId, text) {
  const today = new Date().toISOString().split('T')[0]; // "2025-04-13" みたいな日付にする

  await db.collection('users')
    .doc(userId)
    .collection('logs')
    .doc(today)
    .collection('messages')
    .add({
      text: text,
      timestamp: new Date().toISOString(),
      role: 'user'
    });
}

async function replyToUser(replyToken, message) {
  const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });
}

const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

for (const event of events) {
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text;
    const userId = event.source.userId;

    // Firestoreに保存！
    await saveToFirestore(userId, userMessage);
    const aiReply = await callDify(userId, userMessage);
    await replyToUser(event.replyToken, aiReply);
    await saveToFirestore(userId, aiReply, 'bot');  // ← NEW!


  }
}
  res.sendStatus(200);
});

async function callDify(userId, messageText) {
  try {
    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        inputs: {}, // 入力フィールド使ってなければ空でOK
        query: messageText,
        response_mode: 'blocking',
        user: userId,
      },
      {
        headers: {
          'Authorization': `Bearer ${DIFY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-API-KEY': DIFY_API_KEY,
          'App-Id': DIFY_APP_ID,
        },
      }
    );
    return response.data.answer;
  } catch (error) {
    console.error('Dify error:', error.response?.data || error.message);
    return 'うまく応答できなかったみたい…ごめんね！';
  }
}

app.listen(process.env.PORT || 3000);
