import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

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

const server = http.createServer((req, res) => {
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
