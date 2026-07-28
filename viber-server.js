"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const express = require('express');
const WebSocket = require('ws');
const { processMessage } = require('./secretary');
const { checkCoordination } = require('./atom3-client');
const app = express();
app.use(express.json());
const VIBER_TOKEN = process.env.VIBER_TOKEN || 'YOUR_VIBER_BOT_TOKEN';
const ATOM3_URL = process.env.ATOM3_URL || 'http://192.168.1.100';
const WS_PORT = 8081;
app.post('/viber/incoming', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const event = req.body;
    if (event.event === 'message') {
        const phone = event.sender.id;
        const text = event.message.text;
        console.log(`Viber: ${phone}: ${text}`);
        try {
            yield processMessage(phone, text, ATOM3_URL);
            res.json({ status: 200, body: 'OK' });
        }
        catch (err) {
            console.error('Processing failed:', err);
            res.json({ status: 200, body: 'OK' });
        }
    }
    else {
        res.json({ status: 200, body: 'OK' });
    }
}));
app.get('/health', (req, res) => res.json({ status: 'Atom1 OK' }));
const wss = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', (ws) => {
    console.log('WS Monitor connected');
    ws.send(JSON.stringify({ type: 'status', message: 'Atom1 ready' }));
});
app.listen(8080, '0.0.0.0', () => {
    console.log('🚀 Atom1 Secretary on :8080');
    console.log('📡 WS Monitor on :8081');
});
