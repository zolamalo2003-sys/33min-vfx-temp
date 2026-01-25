import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

function sendJson(res, status, payload) {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(payload));
}

function buildPrompt({type, input}) {
    const isTextbox = type === 'textbox';
    const tone = isTextbox
        ? 'schreibe neutrale, sachliche, lockere und verständliche Infobox-Sätze'
        : 'schreibe kurze, kompakte und klare To-Do-Sätze';
    const rules = isTextbox
        ? 'Kein Prefix wie "Neuigkeit:" verwenden. Nur normale Sätze.'
        : 'Keine langen Erklärungen, nur kurze Stichsatz-Sätze.';

    return {
        system: `Du bist ein deutscher Schreibassistent für Videoinfoboxen und To-Do-Listen. ${tone} ${rules} Entscheide selbst, ob der Input bereits ein fertiger Satz ist (dann gib 3 Umformulierungen) oder ob es eher Notizen sind (dann gib 10 Vorschläge). Gib nur die Vorschläge aus, je Zeile ein Vorschlag, ohne Nummerierung oder Aufzählungszeichen.`,
        user: `Input:\n${input}`
    };
}

async function handleAiRequest(req, res) {
    if (!OPENAI_API_KEY) {
        sendJson(res, 500, {error: 'OPENAI_API_KEY fehlt auf dem Server.'});
        return;
    }

    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });

    req.on('end', async () => {
        try {
            const payload = JSON.parse(body || '{}');
            if (!payload?.input || !payload?.type) {
                sendJson(res, 400, {error: 'Ungültige Anfrage.'});
                return;
            }

            const prompt = buildPrompt(payload);
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {role: 'system', content: prompt.system},
                        {role: 'user', content: prompt.user}
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                sendJson(res, 500, {error: `OpenAI Fehler: ${errorText}`});
                return;
            }

            const data = await response.json();
            const suggestions = data?.choices?.[0]?.message?.content?.trim() || '';
            sendJson(res, 200, {suggestions});
        } catch (error) {
            sendJson(res, 500, {error: error.message || 'Serverfehler.'});
        }
    });
}

const server = http.createServer((req, res) => {
    if (req.url === '/api/ai' && req.method === 'POST') {
        handleAiRequest(req, res);
        return;
    }

    const requestedPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, requestedPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            sendJson(res, 404, {error: 'Nicht gefunden'});
            return;
        }

        const ext = path.extname(filePath);
        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': contentType});
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
