// webhook.js
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  console.log(req.body);
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
