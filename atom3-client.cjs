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
const axios = require('axios');
function checkCoordination(atom3Url, phone) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios.get(`${atom3Url}/data/phones.json`);
            const phones = response.data;
            const phoneData = phones[phone] || {};
            const now = Date.now() / 1000;
            const lastContact = phoneData.last_contact || 0;
            const cooldownHours = 24;
            return (now - lastContact) > (cooldownHours * 3600);
        }
        catch (err) {
            console.error('Atom3 check failed, allowing reply:', err);
            return true;
        }
    });
}
module.exports = { checkCoordination };
