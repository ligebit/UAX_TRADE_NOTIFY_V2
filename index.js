const { BOT } = require('./BOT/BOT.js');
const request = require('request');
const http = require('http');


var bot = new BOT();

/*--- Код для того, что бы будить heroku ---*/
const server = http.createServer((request, response) => {
    response.end('Hello uax notify bot!');
}).listen(process.env.PORT || 3000, (err) => {
    if (err) {
        return console.log('Ошибка сервера ', err)
    }
})

function dontSleep() {
    request("https://api.ethplorer.io/getTokenInfo/", () => {
        console.log('Не спать');
    });
}

SetInterval(dontSleep, 1000*60*25);

/*--- --- ---- ---*/