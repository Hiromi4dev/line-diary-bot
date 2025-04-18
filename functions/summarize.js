const admin = require('firebase-admin');
const axios = require('axios');
const dayjs = require('dayjs');

// Firebase 初期化（CLIからの手動実行もOKなように条件分岐）
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Dify APIキーとApp ID（必要に応じて環境変数に切り出しOK）
const DIFY_API_KEY = 'app-LPokysjihYUkvneK4XODP1Wn';
const DIFY_APP_ID = 'ab1cea18-4cef-4108-b9ab-757a913f94b2';

const userId = 'U41a1f6c2b5a39cf6e7929f533d2b39b3'; // テスト用ユーザーID

async function generateSummaries() {
  try {
    const logsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('logs')
      .where('conversationState', '==', 'ended')
      .get();

    const targetLogs = logsSnapshot.docs.filter(doc => !doc.data().summary);

    if (targetLogs.length === 0) {
      console.log('未要約のログはありません。');
      return;
    }

    for (const doc of targetLogs) {
      const date = doc.id;
      const logRef = doc.ref;

      const messagesSnapshot = await logRef.collection('messages').orderBy('timestamp').get();
      if (messagesSnapshot.empty) {
        console.log(`[${date}] メッセージが存在しません。スキップします。`);
        continue;
      }

      const fullText = messagesSnapshot.docs.map(doc => {
        const data = doc.data();
        const speaker = data.role === 'user' ? 'ユーザー' : 'Bot';
        return `${speaker}：${data.text}`;
      }).join('\n');

      const prompt = `以下は ${date} の会話ログです。この日の出来事を日記形式で要約してください。\n\n${fullText}`;

      try {
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

        const summary = response.data.answer;
        console.log(`[${date}] 要約生成成功:`, summary);

        await logRef.set(
          {
            summary: {
              text: summary,
              generatedAt: admin.firestore.Timestamp.now(),
            },
          },
          { merge: true }
        );

        console.log(`[${date}] Firestoreへの保存完了！`);

      } catch (error) {
        console.error(`[${date}] Dify API エラー:`, error.response?.data || error.message);
      }
    }
  } catch (error) {
    console.error('ログ取得処理でエラー:', error.message);
  }
}

// CLI or Renderなどから手動・定時実行
generateSummaries();
