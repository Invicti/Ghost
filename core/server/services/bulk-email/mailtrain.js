const _ = require('lodash');
const {URL} = require('url');
//const mailgun = require('mailgun-js');
const got = require('got');
const validator = require('@tryghost/validator');
const errors = require('@tryghost/errors');
const ghostVersion = require('@tryghost/version');
const logging = require('@tryghost/logging');
const configService = require('../../../shared/config');
const settingsCache = require('../../../shared/settings-cache');
const request = require('@tryghost/request');
let FormData = require('form-data');
const fetch = require('node-fetch');
const axios = require('axios');
const BATCH_SIZE = 1000;

class Mailgun {
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('apiKey value must be defined!');
        }
        this.username = 'api';
        this.apiKey = options.apiKey;
        this.publicApiKey = options.publicApiKey;
        this.domain = options.domain;
        this.auth = [this.username, this.apiKey].join(':');
        this.mute = options.mute || false;
        this.timeout = options.timeout;

        this.host = options.host || 'api.mailgun.net';
        this.endpoint = options.endpoint || '/v3';
        this.protocol = options.protocol || 'https:';
        this.port = options.port || 443;
        this.retry = options.retry || 1;

        this.testMode = options.testMode;
        this.testModeLogger = options.testModeLogger;

        if (options.proxy) {
            this.proxy = options.proxy;
        }

        this.options = {
            host: this.host,
            endpoint: this.endpoint,
            protocol: this.protocol,
            port: this.port,
            auth: this.auth,
            proxy: this.proxy,
            timeout: this.timeout,
            retry: this.retry,
            testMode: this.testMode,
            testModeLogger: this.testModeLogger
        };

        this.mailgunTokens = {};
    }
}
// function createMailgun(config) {
//     const baseUrl = new URL(config.baseUrl);
//
//     return new Mailgun({
//         apiKey: config.apiKey,
//         domain: config.domain,
//         protocol: baseUrl.protocol,
//         host: baseUrl.hostname,
//         port: baseUrl.port,
//         endpoint: baseUrl.pathname,
//         retry: 5
//     });
// }

function getInstance() {
    const bulkEmailConfig = configService.get('bulkEmail');
    const bulkEmailSetting = {
        apiKey: settingsCache.get('mailgun_api_key'),
        domain: settingsCache.get('mailgun_domain'),
        baseUrl: settingsCache.get('mailgun_base_url')
    };
    const hasMailgunConfig = !!(bulkEmailConfig && bulkEmailConfig.mailgun);
    const hasMailgunSetting = !!(bulkEmailSetting && bulkEmailSetting.apiKey && bulkEmailSetting.baseUrl && bulkEmailSetting.domain);

    if (!hasMailgunConfig && !hasMailgunSetting) {
        logging.warn(`Bulk email service is not configured`);
    } else {
        const mailgunConfig = hasMailgunConfig ? bulkEmailConfig.mailgun : bulkEmailSetting;
        return new Mailgun(mailgunConfig);
    }
    return null;
}

// recipientData format:
// {
//     'test@example.com': {
//         name: 'Test User',
//         unique_id: '12345abcde',
//         unsubscribe_url: 'https://example.com/unsub/me'
//     }
// }
function send(message, recipientData, replacements) {
    if (recipientData.length > BATCH_SIZE) {
        // err - too many recipients
    }

    let messageData = {};

    try {
        const bulkEmailConfig = configService.get('bulkEmail');
        const bulkEmailSetting = {
            apiKey: settingsCache.get('mailgun_api_key'),
            domain: settingsCache.get('mailgun_domain'),
            baseUrl: settingsCache.get('mailgun_base_url')
        };
        const hasMailgunConfig = !!(bulkEmailConfig && bulkEmailConfig.mailgun);
        const hasMailgunSetting = !!(bulkEmailSetting && bulkEmailSetting.apiKey && bulkEmailSetting.baseUrl && bulkEmailSetting.domain);

        if (!hasMailgunConfig && !hasMailgunSetting) {
            logging.warn(`Bulk email service is not configured`);
        } else {
            let mailgunConfig = hasMailgunConfig ? bulkEmailConfig.mailgun : bulkEmailSetting;
        }
        const messageContent = _.pick(message, 'subject', 'html', 'plaintext');

        // update content to use Mailgun variable syntax for replacements
        replacements.forEach((replacement) => {
            messageContent[replacement.format] = messageContent[replacement.format].replace(
                replacement.match,
                `%recipient.${replacement.id}%`
            );
        });

        messageData = {
            to: Object.keys(recipientData),
            from: message.from,
            'h:Reply-To': message.replyTo || message.reply_to,
            subject: messageContent.subject,
            html: messageContent.html,
            text: messageContent.plaintext,
            'recipient-variables': recipientData
        };

        // add a reference to the original email record for easier mapping of mailgun event -> email
        if (message.id) {
            messageData['v:email-id'] = message.id;
        }

        const tags = ['bulk-email'];
        if (bulkEmailConfig && bulkEmailConfig.mailgun && bulkEmailConfig.mailgun.tag) {
            tags.push(bulkEmailConfig.mailgun.tag);
        }
        messageData['o:tag'] = tags;

        if (bulkEmailConfig && bulkEmailConfig.mailgun && bulkEmailConfig.mailgun.testmode) {
            messageData['o:testmode'] = true;
        }

        // enable tracking if turned on for this email
        if (message.track_opens) {
            messageData['o:tracking-opens'] = true;
        }
        return new Promise((resolve, reject) => {
            let reqPayload;
            reqPayload = `EMAIL=${encodeURIComponent(Object.keys(recipientData)[0])}&SUBJECT=${messageData.subject}&SEND_CONFIGURATION_ID=${process.env.mailtrain_configuration_id_as_int}`;
            // eslint-disable-next-line no-undef
            let modurl;
            modurl = `https://${process.env.mailtrain_host}/api/templates/1/send?access_token=${settingsCache.get('mailgun_api_key')}`;
            let toemail = encodeURIComponent(Object.keys(recipientData)[0]);
            const fakeID = '3';
            (async () => {
                try {
                    const {data} = await axios({
                        method: 'POST',
                        url: process.env.mailtrain_url,
                        params: {
                            access_token: settingsCache.get('mailgun_api_key')
                        },
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
                        },
                        data: reqPayload
                    });
                    return resolve({
                        id: fakeID  //data.body.json().id
                    });
                } catch (error) {
                    return reject(error.statusText);
                }
            })();

        });
    } catch (error) {
        return Promise.reject({error, messageData});
    }
}

module.exports = {
    BATCH_SIZE,
    getInstance,
    send
};
