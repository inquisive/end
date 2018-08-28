const Store = require('./mongoose.js');
const moment = require('moment');
const debug = require('debug')('end:routeController');


let feed = function(req, res) {
    Store.Games.findOne({ "gamepk": req.params.gamepk })
    .then( doc => {
        //debug('api doc')
        Store.Events.find({ game: doc._id }, null, { sort: { inning: 1, half: 1, out: 1 } })
        .then(docs => {
            doc.events = docs;
            debug('count events', docs.length)
            res.json(doc);
        }).catch(res.send.bind(res));
    })
    .catch(res.send.bind(res));
};
exports.feed = feed;

exports.feedSocket = function(gamepk, _Projections) {
    return Store.Games.findOne({ "gamepk": gamepk })
    .then( doc => {
        //debug('api doc')
        return Store.Events.find({ game: doc._id }, null, { sort: { inning: 1, half: 1, out: 1 } })
        .then(docs => {
            doc.events = docs;
            debug('count events', docs.length)
            return doc;
        }).catch(debug);
    })
    .catch(debug);
};


exports.scheduleSocket = function(day, _Projections) {
    return Store.Games.find({ 
        "gameDate": {
            "$gte": moment(day).startOf('day').toDate(),
            "$lt": moment(day).endOf('day').toDate() 
        }
    }, null, { sort: { gameDate: 1 } }).then(docs => {
        //console.log('docs', docs.length)
        if ( docs.length > 0 ) {
            //console.log('return docs', docs.length) 
            return docs;
        } else {
            //console.log('get new projection instance')
            let Projections = new _Projections();
            Projections.date(day);
            //console.log('add new games')
            return Projections.addGames()
            .then( games => {
                //console.log('got new games');
                // force add the new events
                return Projections.addEvents(true)
                .then(() => {
                   //console.log('find games new')
                    return Store.Games.find({ 
                        "gameDate": {
                            "$gte": moment(day).startOf('day').toDate(),
                            "$lt": moment(day).endOf('day').toDate() 
                        }
                    }, null, { sort: { gameDate: 1 } })
                    .then(docs2 => {
                        //console.log('return new games', docs2.length)
                        if (!docs2) {
                            return { "results": "no results" };
                        } else {
                            return docs2;
                        }
                    });
                })
                .catch(console)
            })
            .catch(console);
        }
        
     }).catch(console);
};
exports.schedule = function(req, res) {
    Store.Games.find({ 
        "gameDate": {
            "$gte": moment(req.params.day).startOf('day').toDate(),
            "$lt": moment(req.params.day).endOf('day').toDate() 
        }
    }, null, { sort: { gameDate: 1 } }).then(docs => {
        if ( docs.length > 0 ) {
             res.json(docs);
        } else {
            let Projections = new Pro();
            Projections.date(req.query.day);
            Projections.addGames()
            .then( games => {
                Projections.addEvents()
                .then(() => {
                    Store.Games.find({ 
                        "gameDate": {
                            "$gte": moment(req.query.day).startOf('day').toDate(),
                            "$lt": moment(req.query.day).endOf('day').toDate() 
                        }
                    })
                    .then(docs => {
                        if (!docs) {
                            res.json({ "results": "no results" });
                        } else {
                            res.json(docs);
                        }
                    });
                });
            })
            .catch(debug);
        }
        
     }).catch(res.send.bind(res));
};


function populateFeed ( res, docs, gamepk) {
    debug('populate feed', docs.length, gamepk);
    let found = false;
    if( !gamepk ) {
        res.json(docs);
    } else {
        docs.schedule.forEach( v => {
            //debug( v.gamepk )
            if( v.gamepk === gamepk ) {
                debug('api doc', v.gamepk)
                found = true;
                Store.Events.find({ game: v._id }, null, { sort: { inning: 1, half: 1, out: 1 } })
                .then( events => {
                    docs.feed = v;
                    docs.feed.events = events;
                    res.json(docs);
                }).catch(res.send.bind(res));
                return;
            }
        });
        if ( !found ) {
            docs.feed = {}
            res.json(docs);
        }
    }
}

exports.pushData = function(req, res) {
    let day = req.query.day || moment().format("YYYYMMDD");
    let gamepk = req.query.gamepk;
    debug( day, gamepk, req.query);
    Store.Games.find({ 
        "gameDate": {
            "$gte": moment(day).startOf('day').toDate(),
            "$lt": moment(day).endOf('day').toDate() 
        }
    }, null, { sort: { gameDate: 1 } }).then(docs => {
        if ( docs.length > 0 ) {
            populateFeed( res, { query: req.query, schedule: docs }, gamepk); 
        } else {
            let Projections = new Pro();
            Projections.date(req.query.day);
            Projections.addGames()
            .then( games => {
                Projections.addEvents()
                .then(() => {
                    Store.Games.find({ 
                        "gameDate": {
                            "$gte": moment(req.query.day).startOf('day').toDate(),
                            "$lt": moment(req.query.day).endOf('day').toDate() 
                        }
                    })
                    .then(docs => {
                        if (!docs) {
                            res.json({ "results": "no results" });
                        } else {
                            populateFeed( res, { query: req.query, schedule: docs }, gamepk);
                        }
                    });
                });
            })
            .catch(debug);
        }
        
     }).catch(res.send.bind(res));
};