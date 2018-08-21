const request = require('request');
const db = require('./mongoose.js');
const moment = require('moment');
const debug = require('debug')('end:fetch');


class Fetch {
    constructor() {
        this.day = moment();
        this.api1 = 'http://statsapi.mlb.com:80/api/v1/';
        this.api11 = 'http://statsapi.mlb.com:80/api/v1.1/';
        this.url = 'http://statsapi.mlb.com:80';
    }

    set date( date = moment() ) {
        this.day = date;
    }

    getGames() {
        const link = this.api1 + 'schedule?sportId=1&hydrate=team,review,linescore&date=' + this.day.format("L");
        debug(link)
        return this.grab( link );
    }

    getGame( link ) {
        return this.grab( this.url + link.replace('v1', 'v1.1') );
    }

    grab( link ) {
        return new Promise((resolve, reject) => {
            request( 
                { 
                    url: link, 
                    json: true 
                },
                (error, response, body) => {
                    if (error) {
                    reject(error);
                    } else {
                    resolve(body);
                    }
                }
            );
        });

    }

}

module.exports =  new Fetch();
