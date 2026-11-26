require('dotenv').config();
const postgres = require('postgres');

const sql = postgres(process.env.NEON_DATABASE_URL, {
    ssl: 'require',
    max: Number(process.env.DB_POOL_MAX) || 10,
    idle_timeout: 30,
    onnotice: () => {},
});

module.exports = { sql };
