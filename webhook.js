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
async function saveToFirestore(userId, text, role = 'user') {
  const today = new Date().toISOString().split('T')[0]; // "2025-04-13" みたいな日付にする

  await db.collection('users')
    .doc(userId)
    .collection('logs')
    .doc(today)
    .collection('messages')
    .add({
      text: text,
      timestamp: new Date().toISOString(),
      role: role
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
    await replyToUser(event.replyToken, aiReply); // ここの'user'は省略でいい、関数のほうに定義されているから。
    await saveToFirestore(userId, aiReply, 'bot');  // ← NEW!


  }
}
  res.sendStatus(200);
});

async function callDify(userId, messageText) {
  try {
    // 🔽 ① 過去3日分の summary を取得
    const logsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('logs')
      .orderBy('summary.generatedAt', 'desc')
      .limit(3)
      .get();

    // 🔽 ② summaryが存在するものだけ抽出して整形
    const contextText = logsSnapshot.docs
      .filter(doc => doc.data().summary?.text)
      .reverse()
      .map(doc => `【${doc.id}】\n${doc.data().summary.text}`)
      .join('\n\n');

    // 🔽 ③ Difyに渡すプロンプトを生成
    const prompt = `
以下はユーザーの過去3日分の要約です。
これらを踏まえ、現在の発言に対して自然に応答してください。

${contextText}

ユーザー：${messageText}
`;

    // 🔽 ④ Dify API呼び出し
    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        inputs: {},
        query: prompt,
        response_mode: 'blocking',
        user: userId,
      },
      {
        headers: {
          Authorization: `Bearer ${DIFY_API_KEY}`,
          'App-Id': DIFY_APP_ID,
          'Content-Type': 'application/json',
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
