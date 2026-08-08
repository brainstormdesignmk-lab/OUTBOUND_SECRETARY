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
const { checkCoordination } = require('./atom3-client.cjs');
const axios = require('axios');
function processMessage(phone, text, atom3Url) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Processing ${phone}: ${text}`);
        let reply = 'Порака пристигната! 🎯';
        const canReply = yield checkCoordination(atom3Url, phone);
        if (!canReply) {
            reply = 'Ве контактиравме неодамна. Ќе ве контактираме повторно. 🙂';
        }
        else {
            // axios (declared dep) instead of bare global fetch — global fetch
            // only exists on Node 18+, but the Atom boxes run Node 16 (see
            // deploy/ana-initd.example). axios is already used by atom3-client.
            axios.post(`${atom3Url}/data/phones/${phone}/sent`, {
                sent: true,
                timestamp: Date.now()
            }).catch(err => console.error('Flag update failed:', err));
        }
        console.log('📡 Monitor broadcast:', { type: 'viber_message', phone, text, reply });
    });
}
module.exports = { processMessage };
