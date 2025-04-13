// webhook.js
// Firestore（ノート）を使う準備
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json'); // ← ダウンロードしたJSONファイル

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
  }
}
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
