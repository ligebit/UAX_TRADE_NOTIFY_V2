const request = require('request');
const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const TEN_BIG_NUMBER = new BigNumber(10);

class BOT {

    constructor() {
        this.config = require('../config/config.json');

        this.web3http = new Web3(this.config.HttpProvider);

        this.provider = new Web3.providers.WebsocketProvider(this.config.WebsocketProvider);

        this.web3wss = new Web3(this.provider);

        this.subscribeAllEvents();


        //Если соеденение с вебсокетами закрыто
        this.provider.on('end', e => {
            console.log('Соединение с WS закрыто');
            console.log('Повторное соединение с WS...');
            
            this.web3wss = new Web3(provider);
        
            //Повторно подписываемся на все ивенты
            this.subscribeAllEvents();
        
            this.provider.on('connect', function() {
                console.log('Соединение с WS успешно!');
            });
        });

    }

    subscribeEvent(contract, eventName, callback) {
        let eventJsonInterface = this.web3http.utils._.find(
            contract._jsonInterface,
            o => o.name === eventName && o.type === 'event',
        )
    
        let subscription = this.web3wss.eth.subscribe('logs', {
            address: contract.options.address,
            topics: [eventJsonInterface.signature]
        }, (error, result) => {
            if (!error) {
                let eventObj = this.web3http.eth.abi.decodeLog(
                    eventJsonInterface.inputs,
                    result.data,
                    result.topics.slice(1)
                )
                console.log('Последний ивент получен ' + Date(Date.now()));
                callback(eventObj, result.transactionHash);
            } else {
                console.log('Ошибка subscribeEvent ' + error);
            }
        })
    }

    calculatePrice(numeratorAmount, numeratorDecimals, denominatorAmount, denominatorDecimals) {
        // convert to BigNumber
        const numerator = new BigNumber(numeratorAmount.toString())
        const denominator = new BigNumber(denominatorAmount.toString())
      
        if (numeratorDecimals >= denominatorDecimals) {
            const precisionFactor = TEN_BIG_NUMBER.exponentiatedBy(numeratorDecimals - denominatorDecimals)
            return numerator.dividedBy(denominator.multipliedBy(precisionFactor))
        } else {
            const precisionFactor = TEN_BIG_NUMBER.exponentiatedBy(denominatorDecimals - numeratorDecimals)
            return numerator.multipliedBy(precisionFactor).dividedBy(denominator)
        }
    }

    Deposit(contract, eventObj, transactionHash) {
        if(this.config.whitelistTokens.includes(eventObj.token)) {
            this.sendMessageTelegramBot(this.config.telegram.username, `
➕Депозит <code>${eventObj.amount/100}</code> UAX
    
<a href = "https://etherscan.io/address/${eventObj.user}">💼${eventObj.user.substring(0, 5)}...${eventObj.user.substring(37, 42)}</a>
<a href = "https://etherscan.io/tx/${transactionHash}">🏷️Транзакция</a>`);
        
        }
    }

    async Trade(contract, eventObj, transactionHash) {

        //Получаем адреса токенов из id
        let buyToken = await contract.methods.tokenIdToAddressMap(eventObj.buyToken).call();
        let sellToken = await contract.methods.tokenIdToAddressMap(eventObj.sellToken).call();

        //Если токен есть вайтлист массиве
        if(this.config.whitelistTokens.includes(buyToken) || this.config.whitelistTokens.includes(sellToken)) {
    
            //Запрос информации об buyToken токене(тикер, количество знаков после запятой и т.д.)
            request("https://api.ethplorer.io/getTokenInfo/" + buyToken + "?apiKey=freekey", (error, response, buyTokenInfo) => {
                buyTokenInfo = JSON.parse(buyTokenInfo);
        
                //Запрос информации об sellToken токене(тикер, количество знаков после запятой и т.д.)
                request("https://api.ethplorer.io/getTokenInfo/" + sellToken + "?apiKey=freekey", (error, response, sellTokenInfo) => {
                    sellTokenInfo = JSON.parse(sellTokenInfo);
        
                    //Получаем цены
                    let priceBuy = this.calculatePrice(eventObj.executedBuyAmount, buyTokenInfo.decimals, eventObj.executedSellAmount, sellTokenInfo.decimals).toString();
                    let priceSell = this.calculatePrice(eventObj.executedSellAmount, sellTokenInfo.decimals, eventObj.executedBuyAmount, buyTokenInfo.decimals).toString();

                    //Отправляем информацию в телеграм чат
                    this.sendMessageTelegramBot(this.config.telegram.username, `
    ✅Успешный обмен

    <code>${eventObj.executedSellAmount/(Math.pow(10, Number(sellTokenInfo.decimals)))}</code> ${sellTokenInfo.symbol} → <code>${eventObj.executedBuyAmount/(Math.pow(10, Number(buyTokenInfo.decimals)))}</code> ${buyTokenInfo.symbol}

    <a href = "https://etherscan.io/address/${eventObj.owner}">💼${eventObj.owner.substring(0, 5)}...${eventObj.owner.substring(37, 42)}</a>
    <a href = "https://etherscan.io/tx/${transactionHash}">🏷️Транзакция</a>`);
            
        
                });
            });
        }
    }

    Withdraw(contract, eventObj, transactionHash) {

        if(this.config.whitelistTokens.includes(eventObj.token)) {
    
            this.sendMessageTelegramBot(this.config.telegram.username, `
➖Вывод <code>${eventObj.amount/100}</code> UAX
    
<a href = "https://etherscan.io/address/${eventObj.user}">💼${eventObj.user.substring(0, 5)}...${eventObj.user.substring(37, 42)}</a>
<a href = "https://etherscan.io/tx/${transactionHash}">🏷️Транзакция</a>
    `);
        }
    }

    WithdrawRequest(contract, eventObj, transactionHash) {

        if(this.config.whitelistTokens.includes(eventObj.token)) {
    
            this.sendMessageTelegramBot(this.config.telegram.username, `
🕓Запрос на вывод <code>${eventObj.amount/100}</code> UAX
    
<a href = "https://etherscan.io/address/${eventObj.user}">💼${eventObj.user.substring(0, 5)}...${eventObj.user.substring(37, 42)}</a>
<a href = "https://etherscan.io/tx/${transactionHash}">🏷️Транзакция</a>
    `);
        }
    
    }

    async OrderPlacement(contract, eventObj, transactionHash) {

        let buyToken = await contract.methods.tokenIdToAddressMap(eventObj.buyToken).call();
        let sellToken = await contract.methods.tokenIdToAddressMap(eventObj.sellToken).call();

        if(this.config.whitelistTokens.includes(buyToken) || this.config.whitelistTokens.includes(sellToken)) {

            request("https://api.ethplorer.io/getTokenInfo/" + buyToken + "?apiKey=freekey", (error, response, buyTokenInfo) => {
                buyTokenInfo = JSON.parse(buyTokenInfo);

                request("https://api.ethplorer.io/getTokenInfo/" + sellToken + "?apiKey=freekey", (error, response, sellTokenInfo) => {
                    sellTokenInfo = JSON.parse(sellTokenInfo);

                        let priceBuy = this.calculatePrice(eventObj.priceNumerator, buyTokenInfo.decimals, eventObj.priceDenominator, sellTokenInfo.decimals).toString();
                        let priceSell = this.calculatePrice(eventObj.priceDenominator, sellTokenInfo.decimals, eventObj.priceNumerator, buyTokenInfo.decimals).toString();

                        this.sendMessageTelegramBot(this.config.telegram.username, `
    📃Новый ордер

    <code>${eventObj.priceDenominator/(Math.pow(10, Number(sellTokenInfo.decimals)))}</code> ${sellTokenInfo.symbol} → <code>${eventObj.priceNumerator/(Math.pow(10, Number(buyTokenInfo.decimals)))}</code> ${buyTokenInfo.symbol}

    1 ${sellTokenInfo.symbol} = <code>${priceBuy}</code> ${buyTokenInfo.symbol}
    1 ${buyTokenInfo.symbol} = <code>${priceSell}</code> ${sellTokenInfo.symbol}

    <a href = "https://etherscan.io/address/${eventObj.owner}">💼${eventObj.owner.substring(0, 5)}...${eventObj.owner.substring(37, 42)}</a>
    <a href = "https://etherscan.io/tx/${transactionHash}">🏷️Транзакция</a>`);
            
        
                });
            }); 
        }  
    }

    sendMessageTelegramBot = (id, text) => {
        request.post({
            url: this.config.telegram.api + this.config.telegram.token + '/sendMessage',
            form: {
                chat_id: id,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }
        });
    }


    subscribeAllEvents() {
        request(this.config.apiUrlEtherscanGetAbi + this.config.contractAddressMesa, (error, response, contractInterface) => {

            contractInterface = JSON.parse(contractInterface);
            contractInterface = JSON.parse(contractInterface.result);
    
            let contract = new this.web3wss.eth.Contract(contractInterface, this.config.contractAddressMesa);
            
            //Подписываемся на все ивенты
            this.subscribeEvent(contract, 'OrderPlacement', (eventObj, transactionHash)=> {
    
                this.OrderPlacement(contract, eventObj, transactionHash);
                
            });
    
            this.subscribeEvent(contract, 'Withdraw', (eventObj, transactionHash) => {
    
                this.Withdraw(contract, eventObj, transactionHash);
                
            });
    
            this.subscribeEvent(contract, 'Deposit', (eventObj, transactionHash) => {
    
                this.Deposit(contract, eventObj, transactionHash);
                
            });
    
            this.subscribeEvent(contract, 'WithdrawRequest', (eventObj, transactionHash) => {
    
                this.WithdrawRequest(contract, eventObj, transactionHash);
                
            });
    
            this.subscribeEvent(contract, 'Trade', (eventObj, transactionHash) => {
    
                this.Trade(contract, eventObj, transactionHash);
                
            });
        });
    }

}

module.exports = {
    BOT
}