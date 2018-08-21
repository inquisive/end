const Fetch = require('./fetch.js');
const Store = require('./mongoose');
const debug = require('debug')('end:projection');
const moment = require('moment');

class Project {
    constructor() {
        this.day = moment();
        debug(this.day.format("L"));
        this.Games = Store.Games;
        this.Events = Store.Events;
    }

    set date( date = moment().format("L") ) {
        this.day = moment(date);
    }

    addGames() {
        
        Fetch.date = this.day;
        return new Promise( resolve => {
            Fetch.getGames()
            .then( games => {
                const c = games.dates[0].games.length;
                const last = games.dates[0].games[c-1];
                games.dates[0].games.forEach( v => {
                    this.addGame( v )
                        .then( docs => {
                            if ( v.gamePk === last.gamePk) {
                                resolve(this.games);
                            }
                        })
                        .catch(debug)
                })
                return;
            })
            .catch( debug )
        });
    }

    addGame( game ) {
        return this.Games.addGame( game );
    }

    addEvents( link ) {
        return this.getGames()
        .then( games => {
            if (games.length > 0 ) {
                games.forEach( game => {
                    Fetch.getGame( game.link )
                    .then( events => {
                        game.addEvents( events );
                    })
                    .catch( debug )
                })
            }
        })
        
    }

    getGame( gamepk ) {
        return this.Games.find({ gamepk }).then(docs => docs).catch(debug);
    }

    getGames( date ) {
        return this.Games.find( { //query today up to tonight
            "gameDate": {
                "$gte": moment(this.day).startOf('day').toDate(),
                "$lt": moment(this.day).endOf('day').toDate() 
            }
        }).then(docs => docs).catch(debug);
    }

    

}

module.exports = Project;