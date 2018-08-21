const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require('debug')('end:mongoose');
const moment = require('moment');
const Promise = require('bluebird');


// connect to mongo
mongoose.connect('mongodb://localhost/end');

// Schema for Games
let gc = new Schema ({ 
    events: [{ type: Schema.Types.ObjectId, ref: 'Events' }],
    gamepk: String, 
    gameDate: Date,
    link: String,
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    inning: { type: Number, default: 1 },
    half: { type: Number, default: 1 },
    homeTeam: String,
    awayTeam: String,
    homeTeamShort: String,
    awayTeamShort: String,
    home: String,
    away: String,
    homeTeamData: {},
    awayTeamData: {},
    officials : {
        home: String,
        first: String,
        second: String,
        third: String,
        left: String,
        right: String,
    },
    review: {
        hasChallenges: { type: Boolean, default: true },
        away: {
            used: { type: Number, default: 0 },
            remaining: { type: Number, default: 1 }
        },
        home: {
            used: { type: Number, default: 0 },
            remaining: { type: Number, default: 1 }
        }
    },
    startTime: Date,
    balls: { type: Number, default: 0 },
    strikes: { type: Number, default: 0 },
    outs: { type: Number, default: 0 },
    totalOuts: { type: Number, default: 0 },
    projectedOuts: { type: Number, default: 54 },
    gameMinutes: { type: Number, default: 0 },
    playMinutes: { type: Number, default: 0 },
    inningMinutes: { type: Number, default: 0 },
    innings: [],
    projectedEndTime: Date,
    isFinal: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false }
})


gc.post('findOne', function( doc ) {
    //debug(doc);
    if(doc) {
        doc.populate('events').execPopulate().catch(debug);
    }
});

// get difference in minutes
let diff = ( a, b ) => {
    let duration = moment.duration(b.diff(a));
    return duration.minutes();
}

// get the projected end time of game
let project = ( startTime, outs, projected_outs ) => {
    let time = diff( startTime, moment() );
    let per = time / outs;
    let minutes = per * projected_outs;
    return moment(startTime).add( minutes, 'm' );
}

// calculate the total number of outs recorded and the number of outs expected
let calcOuts = ( inning = 1, top, outs = 0, score = {} ) => {
    let o = (inning - 1) * 6;
    // set the total outs
    if ( top ) {
        o += outs;
    } else {
        o += outs + 3;
    }
    // set the projected outs
    let i = (inning > 9) ? inning : 9;
    let p = i * 6;
    if ( score.home > score.away ) {
        p = p-3;
    }

    return {
        outs: o,
        projected: p
    }
}


let fixDate = ( day ) => {
    /* 20180820_233147 */
    if( !day ) return moment();

    let d = day.split('_');
    let time = d[1][0] + d[1][1] + ':' + d[1][2] + d[1][3] + ':' + d[1][4] + d[1][5];
    let date = d[0][0] + d[0][1] +  d[0][2] + d[0][3] + '-' + d[0][4] + d[0][5] + '-' + d[0][6] + d[0][7];
    //debug(moment(date + ' ' + time, "YYYY-MM-DD HH:mm:ss"))
    return moment(date + ' ' + time, "YYYY-MM-DD HH:mm:ss");
}


gc.methods.addEvents = function( live ) {
    //debug( this )
    let _this = this
    let game = live.gameData;
    let data = live.liveData;

    // check if the game has started and if not exit
    debug('Game Status', game.status.detailedState);
    if ( game.status.statusCode != 'I' && game.status.statusCode != 'F' ) {
        return Promise.resolve();
    }

    let plays = data.plays;
    let startTime = moment(fixDate(plays.allPlays[0].playEvents[0].startTime || plays.allPlays[0].playEvents[0].tfs));
    debug('startTime', startTime)
    this.startTime = startTime;

    let score = {
        home: 0,
        away: 0
    }

    let inningData = [];

    // add the officials
    data.boxscore.officials.forEach( function(v) {
        _this.officials[v.position] = v.name;
    })
    
    debug( 'playsByInning', plays.playsByInning.length);
    let playMinutes = 0;
    let gameMinutes = 0;
    let inningMinutes = 0;
    // loop through the plays by inning.  You get an index to access allPlays for information
    for (let i = 1; i <= plays.playsByInning.length; i++) {
        let inningIndex = i-1;
        // add inning info to game
        let track = {
            inning: i,
            startTime: '',
            endTime: '',
            minutes: 0,
            top: {
                startTime: '',
                endTime: '',
                minutes: 0,
            },
            bottom: {
                startTime: '',
                endTime: '',
                minutes: 0,
            }
        }
        
        let inning = plays.playsByInning[inningIndex];

        if ( !inning ) {
            debug('QUIT at ', i, plays.playsByInning[inningIndex])
            continue; 
        }
        
        // startIndex is first pitch of top
        let firstPitch = moment(fixDate(plays.allPlays[inning.startIndex].playEvents[0].startTime || plays.allPlays[inning.startIndex].playEvents[0].tfs));
        track.startTime = moment(firstPitch).toDate();
        track.top.startTime = moment(firstPitch).toDate();
        //debug(firstPitch)
        // last pitch top
        let index = plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents.length - 1;
        debug('find last pitch of inning', i, index, plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents.length )
        let lastPitch = moment(fixDate(plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents[index].endTime || plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents[index].endTfs));
        track.top.endTime = moment(lastPitch).toDate();

        // bottom[0] is first pitch of bottom
        let firstPitchB = moment(fixDate(plays.allPlays[inning.bottom[0]].playEvents[0].startTime || plays.allPlays[inning.bottom[0]].playEvents[0].tfs));
        // last pitch bottom from endIndex
        let index2 = plays.allPlays[inning.endIndex].playEvents.length - 1;
        let lastPitchB = moment(fixDate(plays.allPlays[inning.endIndex].playEvents[index2].endTime || plays.allPlays[inning.endIndex].playEvents[index2].endTfs));
        track.bottom.startTime = moment(firstPitchB).toDate();
        track.bottom.endTime = moment(lastPitchB).toDate();
        track.endTime = moment(lastPitchB).toDate();

        track.minutes = diff( firstPitch, lastPitchB );
        track.top.minutes = diff( firstPitch, lastPitch );
        track.bottom.minutes = diff( firstPitchB, lastPitchB );
        // set the minutes on the main object
        gameMinutes = diff( this.startTime, lastPitchB );
        debug('set game minutes', i, gameMinutes, startTime, lastPitchB );
        // set the inning minutes
        inningMinutes = inningMinutes + diff( firstPitchB, lastPitchB ) + diff( firstPitch, lastPitch );
        debug('set inning minutes', i,  inningMinutes, firstPitchB, lastPitchB, diff( firstPitchB, lastPitchB ),  firstPitch, lastPitch, diff( firstPitch, lastPitch ))

        let calc = calcOuts( i, true, 0, score);
        this.totalOuts = calc.outs;

        // add the inning info
        inningData.push(track);

        // add the top of inning start time
        this.addEvent({
            out: 0,
            inning: i,
            half: 1,
            homeScore: score.home,
            awayScore: score.away,
            timeOfEvent: firstPitch.toDate(),
            projectedEndTime: project( startTime, this.totalOuts, calc.projected ).toDate(),
            startTime: startTime.toDate(), 
        })
        // now loop through the top
        .then( go => {
            // add the outs
            let o = 0;
            let count = inning.top.length - 1;
            let p;
            return new Promise( resolve => {
                for( let ii = 0; ii <= count; ii++ ) {
                    p = plays.allPlays[inning.top[ii]];
                    // check for score
                    if ( p.result.homeScore ) score.home += parseFloat( p.result.homeScore );
                    if ( p.result.awayScore ) score.away += parseFloat( p.result.awayScore );
                    
                    // add the playMinutes
                    let firstPitchB = moment(fixDate( p.playEvents[0].startTime || p.playEvents[0].tfs ));
                    // last pitch bottom from endIndex
                    let index2 = p.playEvents.length - 1;
                    let lastPitchB = moment(fixDate( p.playEvents[index2].endTime || p.playEvents[index2].endTfs));
                    playMinutes = playMinutes + diff( firstPitchB, lastPitchB );

                    // check for an out
                    if ( p.count.outs > o ) {
                        o = p.count.outs;
                        let to = calcOuts( i, true, o, score);
                        this.totalOuts = to.outs;
                        this.addEvent({
                            out: p.count.outs,
                            inning: i,
                            half: 1,
                            homeScore: score.home,
                            awayScore: score.away,
                            timeOfEvent: moment(fixDate( p.about.endTime || p.about.endTfs )).toDate(),
                            projectedEndTime: project( startTime, to.outs, to.projected ).toDate(),
                            startTime: startTime.toDate(), 
                        })
                    }
                        
                    if( ii === count ) resolve();
                }                
            });        
        })
        // add the start time for the bottom of the inning
        .then(this.addEvent({
            out: 0,
            inning: i,
            half: 2,
            homeScore: score.home,
            awayScore: score.away,
            timeOfEvent: firstPitchB.toDate(),
            projectedEndTime: project( startTime, this.totalOuts, calcOuts( i, 2, 0, score).projected ).toDate(),
            startTime: startTime.toDate(), 
        }))     
        // loop through bottom   
        .then( go => {
            // add the outs
            let o = 0;
            let count = inning.bottom.length - 1;
            let p;
            return new Promise( resolve => {
                for( let ii = 0; ii <= count; ii++ ) {
                    p = plays.allPlays[inning.bottom[ii]];
                    // check for score
                    if ( p.result.homeScore ) score.home += parseFloat( p.result.homeScore );
                    if ( p.result.awayScore ) score.away += parseFloat( p.result.awayScore );
                    
                    // add the playMinutes
                    //debug('firstpitch',inning.bottom[ii], p.playEvents[0], p.playEvents.length - 1 )
                    let firstPitchB = moment(fixDate( p.playEvents[0].startTime || p.playEvents[0].tfs));
                    // last pitch bottom from endIndex
                    let index2 = p.playEvents.length - 1;
                    let lastPitchB = moment(fixDate( p.playEvents[index2].endTime || p.playEvents[index2].endTfs));
                    playMinutes = playMinutes + diff( firstPitchB, lastPitchB );

                    // check for an out
                    if ( p.count.outs > o ) {
                        o = p.count.outs;
                        let to = calcOuts( i, true, o, score);
                        this.totalOuts = to.outs;
                        this.addEvent({
                            out: p.count.outs,
                            inning: i,
                            half: 1,
                            homeScore: score.home,
                            awayScore: score.away,
                            timeOfEvent: moment(fixDate( p.about.endTime || p.about.endTfs )).toDate(),
                            projectedEndTime: project( startTime, to.outs, to.projected ).toDate(),
                            startTime: startTime.toDate(), 
                        })
                    }
                        
                    if( ii === count ) resolve();
                }                
            });        
        })
        .then( go => {
            
        })
        .catch(debug);

        if( plays.playsByInning.length === i ) {
            
            this.playMinutes = playMinutes;
            this.gameMinutes = gameMinutes;
            this.inningMinutes = inningMinutes;
            this.inningData = inningData;
            debug('save doc', this.toObject());
            this.save().then().catch(debug);
        }
    }
};

gc.methods.addEvent = function( event ) {
    return this.model('Events').findOneAndUpdate({ 
        game: this._id,
        out: event.out,
        inning: event.inning,
        half: event.half,
        homeScore: event.homeScore,
        awayScore: event.awayScore,
     }, {
        game: this._id,
        out: event.out,
        inning: event.inning,
        half: event.half,
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        timeOfEvent: event.timeOfEvent,
        projectedEndTime: event.projectedEndTime,
        startTime: event.startTime,
    }, {upsert:true} );
};

gc.statics.addGame = function( game ) {
    let _this = this;
    let outs = calcOuts( game.linescore.currentInning, game.linescore.isTopInning, game.linescore.outs, {
        home: game.teams.home.score,
        away: game.teams.away.score
    })
    return new Promise ( ( resolve, reject ) => {
        _this.findOne({ gamepk: game.gamePk })
            .then( doc => {
                if( !doc ) {
                    // add it
                    let aa = new _this( { 
                        gamepk: game.gamePk, 
                        gameDate: moment(game.gameDate).toDate(),
                        link: game.link,
                        home: game.teams.home.team.abbreviation,
                        away: game.teams.away.team.abbreviation,
                        homeTeamShort: game.teams.home.team.shortName,
                        awayTeamShort: game.teams.away.team.shortName,
                        homeTeam: game.teams.home.team.name,
                        awayTeam: game.teams.away.team.name,
                        inning: game.linescore.currentInning,
                        half: game.linescore.isTopInning ? 1 : 2,
                        homeScore: game.teams.home.score,
                        awayScore: game.teams.away.score,
                        homeTeamData: game.teams.home,
                        awayTeamData: game.teams.away,
                        startTime: game.gameDate,
                        balls: game.linescore.balls,
                        strikes: game.linescore.strikes,
                        outs: game.linescore.outs,
                        totalOuts: outs.outs,
                        projectedOuts: outs.projected,
                        isFinal: game.status.statusCode === 'F' ? true : false,
                        review: {
                            hasChallenges: game.review.hasChallenges,
                            away: {
                                used: game.review.away.used,
                                remaining: game.review.away.remaining
                            },
                            home: {
                                used: game.review.home.used,
                                remaining: game.review.home.remaining
                            }
                        },
                        officials : {
                            home: '',
                            first: '',
                            second: '',
                            third: '',
                            left: '',
                            right: '',
                        },
                    } );
                    aa.save().then(resolve).catch(reject);
                } else {
                    doc.link = game.link;
                    doc.gameDate = moment(game.gameDate).toDate();
                    doc.inning = game.linescore.currentInning;
                    doc.half = game.linescore.isTopInning ? 1 : 2;
                    doc.homeScore = game.teams.home.score;
                    doc.awayScore = game.teams.away.score;
                    doc.isFinal = game.status.statusCode === 'F' ? true : false;
                    doc.balls = game.linescore.balls;
                    doc.strikes = game.linescore.strikes;
                    doc.outs = game.linescore.outs;
                    doc.totalOuts = outs.outs;
                    doc.projectedOuts = outs.projected;
                    doc.review.hasChallenges = game.review.hasChallenges;
                    doc.review.away.used = game.review.away.used;
                    doc.review.away.remaining = game.review.away.remaining;
                    doc.review.home.used = game.review.home.used;
                    doc.review.home.remaining = game.review.home.remaining;
                    doc.save().then(resolve).catch(reject);
                }
            })
        .catch(reject);
    });
}

exports.Games = mongoose.model('Games', gc);

exports.Events = mongoose.model('Events', { 
    game: { type: Schema.Types.ObjectId, ref: 'Games' },
    out: Number,
    inning: Number,
    half: Number,
    homeScore: Number,
    awayScore: Number,
    timeOfEvent: Date,
    projectedEndTime: Date,
    startTime: Date,
});

exports.GamePks = mongoose.model('GamePks', { 
    gamepk: String, 
    complete: { type: Boolean, default: false }
});

//const kitty = new Cat({ name: 'Zildjian' });
//kitty.save().then(() => console.log('meow'));