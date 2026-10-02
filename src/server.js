require('dotenv').config({ quiet: true });

for (const name of ['DATABASE_URL', 'JWT_SECRET', 'WEBHOOK_SECRET']) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = require('./app');
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});