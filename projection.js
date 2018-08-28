const Fetch = require('./fetch');
const Store = require('./mongoose');
const debug = require('debug')('end:projection');
const moment = require('moment');
const Data = require('./routeController');


class Project {
    constructor() {
        this.day = moment();
        //debug(this.day.format("L"));
        this.Games = Store.Games;
        this.Events = Store.Events;
        this.runAlways = false;
        this.io = false;
    }

    date ( date = moment().format("YYYYMMDD") ) {
        this.day = moment(date);
    }

    addSockets(io) {
        this.io = io;
        // handle incoming connections from clients
        io.on('connection', (socket) => {
            // listen for game changes for the feed
            socket.on('gamepk', (gamepk) => {
                socket.join(gamepk);
                //console.log('join room', gamepk)
                Data.feedSocket(gamepk, Project)
                .then(feed => {
                    //console.log('emit feed')
                    this.io.sockets.in(gamepk).emit('feed', feed);
                })
            });
            socket.on('schedule', (day) => {
                Data.scheduleSocket(day, Project)
                .then(schedule => {
                    //console.log('emit schedule', schedule.length)
                    this.io.emit('schedule', schedule);
                })
                .catch(console)
            });
        });
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
                                if ( this.io7 ) {
                                    Data.scheduleSocket(this.day)
                                    .then(schedule => {
                                        console.log('emit schedule in addGames', schedule)
                                        this.io.sockets.emit('schedule', schedule);
                                    })  
                                }
                                resolve(docs);
                            }
                        })
                        .catch(debug)
                })
            })
            .catch( debug )
        });
    }

    addGame( game ) {
        return this.Games.addGame( game )
        .then(games => {
            // send this info to a room
            return games;
        });
    }

    addEvents( force = false ) {
        let runAlways = this.runAlways || force;
        return this.getInProgressGames(runAlways)
        .then( games => {
            if (games.length > 0 ) {
                debug('Get events for ' + games.length + ' games');
                games.forEach( game => {
                    if ( !game.isComplete || runAlways  ) {
                        Fetch.getGame( game.link )
                        .then( events => {
                            return game.addEvents( events, runAlways )
                            .then(game => {
                                // send this info to a room
                                if ( this.io ) {
                                    Data.feedSocket(game.gamepk)
                                    .then(feed => {
                                        this.io.sockets.in(game.gamepk).emit('feed', feed);
                                    })  
                                }
                            })
                        })
                        .catch( debug )
                    } else {
                        debug('skipping', game.id);
                    }
                })
            } else {
                debug('No games in progress for ', moment(this.day).format("L"))
            }
        })
        
    }

    getGame( gamepk ) {
        return this.Games.find({ gamepk }).then(docs => docs).catch(debug);
    }

    getInProgressGames( force = false ) { 
        let search = { //query today up to tonight
            "gameDate": {
                "$lt": moment(this.day).subtract(15, 'minutes').toDate() 
            },
            // abstractGameCode for Final or Live
            //$or:[ {'status.abstractGameCode': 'F'}, {'status.abstractGameCode': 'L'} ] 
            $or:[ {'isFinal': false}, {'isComplete': false} ] 
        }
        if ( this.runAlways || force ) {
            search = { //query today up to tonight
                "gameDate": {
                    "$gte": moment(this.day).subtract(12, 'hours').startOf('day').toDate(),
                    "$lt": moment(this.day).endOf('day').toDate() 
                }
            }
        }
        return this.Games.find(search).then(docs => docs).catch(debug);
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