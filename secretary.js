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
const { checkCoordination } = require('./atom3-client');
function processMessage(phone, text, atom3Url) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Processing ${phone}: ${text}`);
        let reply = 'Порака пристигната! 🎯';
        const canReply = yield checkCoordination(atom3Url, phone);
        if (!canReply) {
            reply = 'Ве контактиравме неодамна. Ќе ве контактираме повторно. 🙂';
        }
        else {
            fetch(`${atom3Url}/data/phones/${phone}/sent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sent: true, timestamp: Date.now() })
            }).catch(err => console.error('Flag update failed:', err));
        }
        console.log('📡 Monitor broadcast:', { type: 'viber_message', phone, text, reply });
    });
}
module.exports = { processMessage };
