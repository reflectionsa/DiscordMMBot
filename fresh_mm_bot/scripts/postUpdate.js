// One-time script: posts the April 3-4 update embed to the status channel
// Run with: node scripts/postUpdate.js
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manual .env parse (no dotenv dep needed)
const envPath = resolve(process.cwd(), '.env');
const env = Object.fromEntries(
    readFileSync(envPath, 'utf-8')
        .split('\n')
        .filter(l => l.includes('='))
        .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);

const TOKEN = env['BOT_TOKEN'];
const CHANNEL_ID = '1490124502120661122';
const ROLE_ID = '1422408866020462664';

if (!TOKEN) {
    console.error('BOT_TOKEN not found in .env');
    process.exit(1);
}

const body = JSON.stringify({
    embeds: [
        {
            title: '📋 Bot Updates — April 3',
            description: [
                'A lot went in today, here\'s the rundown:\n',
                '• **Party System** — Full party management added. Players can create parties, invite others, and queue together.',
                '• **Duel Queue** — New duel queue feature with its own queue selection flow and ready-up interaction.',
                '• **/end_match** — Mods can now nullify a match and automatically reverse all rating changes for players involved.',
                '• **Lookup & Party embeds** — Both commands got polished embed responses with improved user-facing info.',
                '• **Redis Caching** — Player and queue services now use Redis for faster lookups.',
                '• **Mod role fix** — Mod role validation now falls back to a hardcoded env var if the role isn\'t found in config.',
                '• **/reset_season** — Hard resets all player elos to 1000 and clears match history. Confirmation button required before it runs.',
                '• **Bot status messages** — Bot now announces when it comes online 🟢 and goes offline 🔴 in this channel.',
            ].join('\n'),
            color: 0xffb3c6,
            footer: { text: 'April 3–4, 2026' },
        },
    ],
});

const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json',
    },
    body,
});

if (!res.ok) {
    const err = await res.text();
    console.error('Failed to post update:', res.status, err);
    process.exit(1);
}

console.log('✅ Update embed posted successfully.');
