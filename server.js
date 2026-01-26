import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

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

function readStore() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const animations = Array.isArray(parsed.animations) ? parsed.animations : [];
        const maxId = animations.reduce((max, anim) => {
            const value = Number(anim?.id);
            return Number.isNaN(value) ? max : Math.max(max, value);
        }, 0);
        const nextId = Math.max(Number(parsed.nextId) || 1, maxId + 1);
        return { animations, nextId };
    } catch (error) {
        return { animations: [], nextId: 1 };
    }
}

function writeStore(store) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
    });
}

const server = http.createServer((req, res) => {
    if (req.url === '/api/animations' && req.method === 'GET') {
        const store = readStore();
        sendJson(res, 200, store);
        return;
    }

    if (req.url === '/api/animations/replace' && req.method === 'POST') {
        readJsonBody(req)
            .then(payload => {
                const animations = Array.isArray(payload?.animations) ? payload.animations : null;
                if (!animations) {
                    sendJson(res, 400, { error: 'Ungültige Daten.' });
                    return;
                }
                const maxId = animations.reduce((max, anim) => {
                    const value = Number(anim?.id);
                    return Number.isNaN(value) ? max : Math.max(max, value);
                }, 0);
                const store = { animations, nextId: maxId + 1 };
                writeStore(store);
                sendJson(res, 200, store);
            })
            .catch(() => sendJson(res, 400, { error: 'Ungültiges JSON.' }));
        return;
    }

    if (req.url === '/api/animations/add' && req.method === 'POST') {
        readJsonBody(req)
            .then(payload => {
                if (!payload || typeof payload.animation !== 'object') {
                    sendJson(res, 400, { error: 'Ungültige Anfrage.' });
                    return;
                }
                const store = readStore();
                const animation = { ...payload.animation, id: store.nextId };
                store.nextId += 1;
                store.animations.push(animation);
                writeStore(store);
                sendJson(res, 200, store);
            })
            .catch(() => sendJson(res, 400, { error: 'Ungültiges JSON.' }));
        return;
    }

    if (req.url === '/api/animations/update' && req.method === 'POST') {
        readJsonBody(req)
            .then(payload => {
                const animation = payload?.animation;
                if (!animation || animation.id === undefined || animation.id === null) {
                    sendJson(res, 400, { error: 'Ungültige Anfrage.' });
                    return;
                }
                const store = readStore();
                const index = store.animations.findIndex(item => String(item.id) === String(animation.id));
                if (index === -1) {
                    sendJson(res, 404, { error: 'Eintrag nicht gefunden.' });
                    return;
                }
                store.animations[index] = animation;
                writeStore(store);
                sendJson(res, 200, store);
            })
            .catch(() => sendJson(res, 400, { error: 'Ungültiges JSON.' }));
        return;
    }

    if (req.url === '/api/animations/delete' && req.method === 'POST') {
        readJsonBody(req)
            .then(payload => {
                if (payload?.id === undefined || payload?.id === null) {
                    sendJson(res, 400, { error: 'Ungültige Anfrage.' });
                    return;
                }
                const store = readStore();
                const nextAnimations = store.animations.filter(item => String(item.id) !== String(payload.id));
                store.animations = nextAnimations;
                const maxId = nextAnimations.reduce((max, anim) => {
                    const value = Number(anim?.id);
                    return Number.isNaN(value) ? max : Math.max(max, value);
                }, 0);
                store.nextId = Math.max(store.nextId, maxId + 1);
                writeStore(store);
                sendJson(res, 200, store);
            })
            .catch(() => sendJson(res, 400, { error: 'Ungültiges JSON.' }));
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
