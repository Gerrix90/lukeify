import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const config = require('../../config.json');
const twitter = require('twitter');
const superagent = require('superagent');

(async () => {

    // Twitter
    const client = new twitter({
        consumer_key: config.twitter.consumerKey,
        consumer_secret: config.twitter.consumerSecret,
        access_token_key: config.twitter.tokenKey,
        access_token_secret: config.twitter.tokenSecret
    });

    client.get('statuses/user_timeline', {
        screen_name: config.twitter.screenName,
        count: config.twitter.tweetCount
    }, (error, tweets, response) => {
        if (error) throw error;
        fs.writeFile(path.join(__dirname, "../../tweets.json"), JSON.stringify(tweets), () => {});
    });

    // Instagram. This is so fucked up. I spent way too long trying to make this work.
    /**
     *
     * @param {string[]} cookies
     * @returns {string}
     */
    const getCookieValueFromKey = function(key: string, cookies: string[]): string {
        const cookie = cookies.find(c => c.indexOf(key) !== -1);
        if (!cookie) {
            throw new Error('No key found.');
        }
        return (RegExp(key + '=(.*?);', 'g').exec(cookie))[1];
    };

    /**
     * generateRequestSignature, a.k.a. 'appeaseInstagram'.
     *
     * @param rhxGis
     * @param csrfToken
     * @param userAgent
     * @param queryVariables
     * @returns {string}
     */
    const generateRequestSignature = function(rhxGis: string, csrfToken: string, userAgent: string, queryVariables): string {
        const magicString = `${rhxGis}:${csrfToken}:${userAgent}:${queryVariables}`;
        return crypto.createHash('md5').update(magicString, 'utf8').digest("hex");
    };

    try {
        const userAgent         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/604.3.5 (KHTML, like Gecko) Version/11.0.1 Safari/604.3.5';
        const initResponse      = await superagent.get('https://www.instagram.com/');
        const rhxGis            = (RegExp('"rhx_gis":"([a-f0-9]{32})"', 'g')).exec(initResponse.text)[1];
        const cookies           = initResponse.header['set-cookie'];

        const csrfTokenCookie   = getCookieValueFromKey('csrftoken', cookies);
        const midCookie         = getCookieValueFromKey('mid', cookies);
        const rurCookie         = getCookieValueFromKey('rur', cookies);

        const queryVariables = JSON.stringify({
            id: "5380311726",
            first: 9
        });

        const res = await superagent.get('https://www.instagram.com/graphql/query/')
            .query({
                query_hash: '42323d64886122307be10013ad2dcc44',
                variables: queryVariables
            })
            .set({
                'User-Agent': userAgent,
                'Accept': '*/*',
                'Accept-Language': 'en-US',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'close',
                'X-Instagram-GIS': generateRequestSignature(rhxGis, csrfTokenCookie, userAgent, queryVariables),
                'Cookie': `rur=${rurCookie}; csrftoken=${csrfTokenCookie}; mid=${midCookie}; ig_pr=1`
            });

        const images = res.body.data.user.edge_owner_to_timeline_media.edges.map(image => {
            return {
                id: image.node.id,
                caption: image.node.edge_media_to_caption.edges[0].node.text,
                shortcode: image.node.shortcode,
                thumb: image.node.thumbnail_resources.pop().src
            }
        });

        fs.writeFile(path.join(__dirname, "../../instas.json"), JSON.stringify(images), () => {});

    } catch (e) {
        console.log(e);
    }
})();

