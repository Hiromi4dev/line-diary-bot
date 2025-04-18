const admin = require('firebase-admin');
const axios = require('axios');
const dayjs = require('dayjs');

// Firebase初期化（CLIから実行するならコメントアウト不要）
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Dify APIキーとApp ID（環境変数 or 直接書き込み）
const DIFY_API_KEY = 'app-LPokysjihYUkvneK4XODP1Wn';
const DIFY_APP_ID = 'ab1cea18-4cef-4108-b9ab-757a913f94b2';

const userId = 'U41a1f6c2b5a39cf6e7929f533d2b39b3'; // ← ここはテスト用に一人分指定してください
const date = dayjs().format('YYYY-MM-DD'); // 今日の日付でテスト

async function generateSummary() {
  const logRef = db.collection('users').doc(userId).collection('logs').doc(date);

  const logDoc = await logRef.get();
  if (!logDoc.exists || logDoc.data().conversationState !== 'ended') {
    console.log('会話が終了していないか、ログが存在しません。');
    return;
  }

  const messagesSnapshot = await logRef.collection('messages').orderBy('timestamp').get();
  if (messagesSnapshot.empty) {
    console.log('メッセージが存在しません。');
    return;
  }

  const fullText = messagesSnapshot.docs.map(doc => doc.data().text).join('\n');

  const prompt = `以下の会話内容をもとに、今日一日がどんな日だったかを簡潔に日記形式でまとめてください。\n\n${fullText}`;

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
    console.log('要約生成成功:', summary);

    await logRef.set(
      {
        summary: {
          text: summary,
          generatedAt: admin.firestore.Timestamp.now(),
        },
      },
      { merge: true }
    );

    console.log('Firestoreへの保存完了！');
  } catch (error) {
    console.error('Dify API エラー:', error.response?.data || error.message);
  }
}

// CLIから手動実行する場合用
generateSummary();
