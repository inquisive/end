const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require('debug')('end:mongoose');
const moment = require('moment');
const Promise = require('bluebird');
mongoose.Promise = Promise;

// connect to mongo
mongoose.connect('mongodb://localhost/end');

// Schema for Games
let gc = new Schema ({ 
    events: [{ type: Schema.Types.ObjectId, ref: 'Events' }],
    gamepk: String,
    id: String, 
    gameDate: Date,
    link: String,
    feed: String,
    status: {},
    homeScore: { type: Number, default: 0 },
    homeHits: { type: Number, default: 0 },
    homeErrors: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    awayHits: { type: Number, default: 0 },
    awayErrors: { type: Number, default: 0 },
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
    officials : [],
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
    runnerIndex: [],
    runners: [],
    offense: {},
    startTime: Date,
    balls: { type: Number, default: 0 },
    strikes: { type: Number, default: 0 },
    outs: { type: Number, default: 0 },
    totalOuts: { type: Number, default: 0 },
    projectedOuts: { type: Number, default: 54 },
    gameMinutes: { type: Number, default: 0 },
    playMinutes: { type: Number, default: 0 },
    inningMinutes: { type: Number, default: 0 },
    halfInningMinutes: { type: Number, default: 0 },
    innings: [],
    projectedEndTime: Date,
    projectedMinutes: Number,
    isFinal: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false }
})


gc.post('findOne', function( doc ) {
    //debug('post fingOne populate', doc);
    if(doc) {
        //doc.populate('events').execPopulate().catch(debug);
    }
});

// get difference in minutes
let diff = ( a, b ) => {
    let duration =  moment(b).diff(moment(a), 'minutes');
    return duration;
}

// get the projected end time of game
let projectFunc = ( startTime, currentTime, outs, projected_outs ) => {
    
    let avg = 3.33 // avg time per out for league (3 hr game so close enough)
    let time = diff( startTime, currentTime );
    let ourAvg = time / outs;
    // make a new average from ours and the mlb avg
    // weight it based on the percentage of outs made
    let gameWeight = outs / projected_outs;
    let leagueWeight = 1 - gameWeight;
    let newAvg = (avg * leagueWeight) + (ourAvg * gameWeight);
    let minutes = Math.round(newAvg * projected_outs);
    return {
        moment: moment(startTime).add( minutes, 'm' ),
        minutes: minutes
    }
}

let project = ( startTime, currentTime, outs, projected_outs ) => {
    return projectFunc( startTime, currentTime, outs, projected_outs ).moment;
}


let projectM = ( startTime, currentTime, outs, projected_outs ) => {
    return projectFunc( startTime, currentTime, outs, projected_outs ).minutes;
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
    // sometimes the home team wins on a walk off
    // this fucks us up, so try and account for it
    let i = (inning > 9) ? inning : 9;
    let p = i * 6;
    if ( score.home > score.away ) {
        if (inning >= 9 && !top && outs < 3) {
            // home wins on a walk off
            p = p - ( 3 - outs);
        } else {
            p = p - 3;
        }
    }

    return {
        outs: o,
        projected: p
    }
}


let fixDate = ( day ) => {
    
    return day;

    // below is for v1 of the api
    /* 20180820_233147 */
    if( !day ) return moment();

    let d = day.split('_');
    let time = d[1][0] + d[1][1] + ':' + d[1][2] + d[1][3] + ':' + d[1][4] + d[1][5];
    let date = d[0][0] + d[0][1] +  d[0][2] + d[0][3] + '-' + d[0][4] + d[0][5] + '-' + d[0][6] + d[0][7];
    //debug(moment(date + ' ' + time, "YYYY-MM-DD HH:mm:ss"))
    return moment(date + ' ' + time, "YYYY-MM-DD HH:mm:ss");
}


gc.methods.addEvents = function( live, runAlways = false ) {
    //debug( this )
    let _this = this
    let game = live.gameData;
    let data = live.liveData;

    // check if the game has started and if not exit
    //debug('Game Status', game.status.detailedState);
    //debug('Game ID', game.game.id, data.plays.playsByInning.length);
    if ( game.status.abstractGameCode != 'L' && game.status.abstractGameCode != 'F' && !runAlways ) {
        debug('Not in progress');
        return Promise.resolve();
    }

    // if this is complete skip
    if ( this.isCompleted && !runAlways ) {
        return Promise.resolve();
    }
    let plays = data.plays;
    let startTime = moment(plays.allPlays[0].playEvents[0].startTime);
    //debug('startTime', startTime)
    this.startTime = startTime;

    let score = {
        home: 0,
        away: 0
    }

    let inningData = [];

    // add the officials
    this.officials = data.boxscore.officials;
    
    // add the id
    this.id = game.game.id;
    
    //debug( 'innings', plays.playsByInning.length);
    let playMinutes = 0;
    let gameMinutes = 0;
    let inningMinutes = 0;
    let halfInningMinutes = 0;

    // loop through the plays by inning.  You get an index to access allPlays for information
    for (let i = 1; i <= plays.playsByInning.length; i++) {
        let inningIndex = i-1;
        // add inning info to game
        let track = {
            inning: i,
            startTime: '',
            endTime: '',
            minutes: 0,
            projectedEndTime: '',
            top: {
                startTime: '',
                endTime: '',
                minutes: 0,
                projectedEndTime: '',
            },
            bottom: {
                startTime: '',
                endTime: '',
                minutes: 0,
                projectedEndTime: '',
            }
        }
        
        let inning = plays.playsByInning[inningIndex];

        if ( !inning ) {
            debug('QUIT at ', i, plays.playsByInning[inningIndex])
            continue; 
        }
        
        //debug(inning)

        // startIndex is first pitch of top
        let firstPitch = moment(plays.allPlays[inning.startIndex].playEvents[0].startTime);
        //debug('firstpitch', i, firstPitch);
        track.startTime = firstPitch.toDate();
        track.top.startTime = firstPitch.toDate();
        //debug(firstPitch)
        // last pitch top
        let index = plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents.length - 1;
        if ( index < 0 ) index = 0;
        //debug('find last pitch of inning', i, index, plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents.length )
        let lastPitch = moment(fixDate(plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents[index].endTime || plays.allPlays[inning.top[(inning.top.length - 1)]].playEvents[index].endTfs));
        track.top.endTime = lastPitch.toDate();

        // last pitch bottom from endIndex
        let index2 = plays.allPlays[inning.endIndex].playEvents.length - 1;
        if ( index2 < 0 ) index2 = 0;
        let lastPitchB = moment(fixDate(plays.allPlays[inning.endIndex].playEvents[index2].endTime || plays.allPlays[inning.endIndex].playEvents[index2].endTfs));
        
        track.endTime = lastPitchB.toDate();
        track.minutes = diff( firstPitch, lastPitchB );
        track.top.minutes = diff( firstPitch, lastPitch );
        
        let firstPitchB;
        
        // only do the bottom if it exists
        if ( inning.bottom.length > 0 ) {
            // bottom[0] is first pitch of bottom
            firstPitchB = moment(fixDate(plays.allPlays[inning.bottom[0]].playEvents[0].startTime || plays.allPlays[inning.bottom[0]].playEvents[0].tfs));
            track.bottom.startTime = firstPitchB.toDate();
            track.bottom.endTime = lastPitchB.toDate();
            track.bottom.minutes = diff( firstPitchB, lastPitchB );
        }

        // set the inning minutes
        inningMinutes = inningMinutes + track.minutes;
        halfInningMinutes = halfInningMinutes + track.top.minutes + track.bottom.minutes;
        //debug('set inning minutes', i,  inningMinutes)

        let calc = calcOuts( i, true, 0, score);
        this.totalOuts = calc.outs;

        // add the outs
        let oots = 0
        let count = inning.top.length - 1
        let p;
        let pMinutes = 0
        let pMinutesB = 0
        // top of inning   
        for( let ii = 0; ii <= count; ii++ ) {
            p = plays.allPlays[inning.top[ii]];
            // check for score
            if ( p.result.homeScore ) score.home =  p.result.homeScore ;
            if ( p.result.awayScore ) {
                score.away =  p.result.awayScore ;
                //debug('Add away score', score, p.result.awayScore);
            }
            
            if ( !p.playEvents[0] ) {
                continue;
            }
            
            // loop through play events until you find a startTime
            let startT;
            p.playEvents.forEach( v => {
                if (startT == undefined && v.startTime) {
                    startT = v.startTime
                }
            })
            // add the playMinutes
            let firstPitch = moment( startT );
            // last pitch bottom from endIndex
            let index2 = p.playEvents.length - 1;
            let lastPitch = moment( p.playEvents[index2].endTime );
            
            playMinutes = playMinutes + diff( firstPitch, lastPitch );
            pMinutes = pMinutes + diff( firstPitch, lastPitch );    
            // check for an out
            if ( p.count.outs > oots ) {
                //oots = p.count.outs;
                // check for multiple outs
                if ( p.count.outs - oots > 1 ) {
                    // we have multiple outs
                    for ( w = (oots + 1); w <= p.count.outs; w++ ) {
                        addE( w );
                        oots++;
                    }
                    
                    
                } else {
                    // single out
                    //debug( i, 'top', p.count.outs);
                    addE( p.count.outs );
                    oots++;
                }
                
                function addE( outs ) {
                    let to = calcOuts( i, true, outs, score);
                    _this.totalOuts = to.outs;
                    let pp = project( startTime, moment(p.about.endTime), to.outs, to.projected ).toDate();
                    let pm = projectM( startTime, moment(p.about.endTime), to.outs, to.projected );
                    _this.projectedEndTime = pp;
                    _this.projectedMinutes = pm;
                    return _this.addEvent({
                        out: outs,
                        inning: i,
                        half: 1,
                        homeScore: score.home,
                        awayScore: score.away,
                        timeOfEvent: moment(fixDate( p.about.endTime || p.about.endTfs )).toDate(),
                        projectedEndTime: pp,
                        projectedMinutes: pm,
                        startTime: startTime.toDate(), 
                    })
                    
                }
            }    
        }                
                    
        // loop through bottom   
        // add the outs
        oots = 0;
        count = inning.bottom.length - 1;
        if ( inning.bottom.length > 0 ) {   
            let p;
            for( let ii = 0; ii <= count; ii++ ) {
                p = plays.allPlays[inning.bottom[ii]];
                
                if ( !p.playEvents[0] ) {
                    continue;
                }
                
                // check for score
                if ( p.result.homeScore ) score.home =  p.result.homeScore ;
                if ( p.result.awayScore ) score.away =  p.result.awayScore ;
                
                // loop through play events until you find a startTime
                let startT;
                p.playEvents.forEach( v => {
                    if (startT == undefined && v.startTime) {
                        startT = v.startTime
                    }
                })
                // add the playMinutes
                //debug('firstpitch',inning.bottom[ii], p.playEvents[0], p.playEvents.length - 1 )
                let firstPitchB = moment( startT );
                // last pitch bottom from endIndex
                let index2 = p.playEvents.length - 1;
                let lastPitchB = moment( p.playEvents[index2].endTime );
                //if( this.gamepk === '531284' ) {
                //debug('playMinutes', 'B'+i, playMinutes, diff( firstPitchB, lastPitchB ));
                //}
                playMinutes = playMinutes + diff( firstPitchB, lastPitchB );
                pMinutesB = pMinutesB + diff( firstPitchB, lastPitchB );
                // check for an out
                if ( p.count.outs > oots ) {
                    //oots = p.count.outs;
                    // check for multiple outs
                    if ( p.count.outs - oots > 1 ) {
                        // we have multiple outs
                        for ( w = (oots + 1); w <= p.count.outs; w++ ) {
                            //if( this.gamepk == '531279') debug('add out', w);
                            addE( w );  
                            oots++;                       
                        }
                        
                    } else {
                        // single out
                        //debug( i, 'bot', p.count.outs);
                        addE( p.count.outs );
                        //if( this.gamepk == '531279') debug('add out', p.count.outs);
                        oots++;
                        
                    }
                    
                    function addE( outs ) {
                        let to = calcOuts( i, false, outs, score);
                        _this.totalOuts = to.outs;
                        let pp = project( startTime, moment(p.about.endTime), to.outs, to.projected ).toDate();
                        let pm = projectM( startTime, moment(p.about.endTime), to.outs, to.projected );
                        _this.projectedEndTime = pp;
                        _this.projectedMinutes = pm;
                        return _this.addEvent({
                            out: outs,
                            inning: i,
                            half: 2,
                            homeScore: score.home,
                            awayScore: score.away,
                            timeOfEvent: moment(fixDate( p.about.endTime || p.about.endTfs )).toDate(),
                            projectedEndTime: pp,
                            projectedMinutes: pm,
                            startTime: startTime, 
                        })
                        
                    }

                }        
            }                          
        }
        
        //set the projected end time for this inning
        let to = calcOuts( i, false, 3, score)
        track.top.projectedEndTime = project( this.startTime, moment(track.top.endTime), (i * 6) - 3, to.projected).toDate()
        track.bottom.projectedEndTime = project( this.startTime, moment(track.bottom.endTime), i * 6, to.projected).toDate()
        track.projectedEndTime = track.bottom.projectedEndTime
        track.top.playMinutes = pMinutes
        track.bottom.playMinutes = pMinutesB
        track.playMinutes = pMinutes + pMinutesB
        // add the inning info
        inningData.push(track)
        if( plays.playsByInning.length === i ) {
            //console.log('save')
            // set the minutes on the main object
            // plays.allPlays[0].playEvents[0].startTime
            let cc = plays.allPlays.length - 1
            let ccc = plays.allPlays[cc].playEvents.length -1
            let duration =  moment(plays.allPlays[cc].playEvents[ccc].endTime).unix() -  moment(this.startTime).unix()
            this.gameMinutes = Math.round(duration / 60)
            let outInfo = calcOuts(data.linescore.currentInning, data.linescore.isTopInning, data.linescore.outs, { home: data.linescore.teams.home.runs, away: data.linescore.teams.away.runs })
            this.projectedEndTime = project( this.startTime, moment(), outInfo.outs, outInfo.projected).toDate();
            this.projectedMinutes = projectM( this.startTime, moment(), outInfo.outs, outInfo.projected );            
            this.playMinutes = playMinutes
            this.inning = data.linescore.currentInning
            this.half = data.linescore.isTopInning ? 1 : 2
            this.homeScore = data.linescore.teams.home.runs
            this.homeHits = data.linescore.teams.home.hits
            this.homeErrors = data.linescore.teams.home.errors
            this.awayScore = data.linescore.teams.away.runs
            this.awayHits = data.linescore.teams.away.hits
            this.awayErrors = data.linescore.teams.away.errors
            this.status = game.status
            this.review = game.review
            this.isFinal = (game.status.abstractGameCode === 'F') ? true : false
            this.isCompleted = (game.status.abstractGameCode === 'F') ? true : false
            this.balls = data.linescore.balls
            this.strikes = data.linescore.strikes
            this.outs = data.linescore.outs
            this.halfInningMinutes = halfInningMinutes
            this.inningMinutes = inningMinutes
            this.offense = data.linescore.offense
            this.innings = inningData
            this.projectedOuts = outInfo.projected
            this.totalOuts = outInfo.outs  
            this.save().then().catch(debug)

            //console.log('linescore', this.offense, data.linescore.offense)
                        
            return Promise.resolve(this)
        }
    }
};

let ce = 0;
gc.methods.addEvent = function( event ) {
    //debug('add event', event, ce++)
    return new Promise ( ( resolve, reject ) => {
        this.model('Events').findOne({ 
            game: this._id,
            out: event.out,
            inning: event.inning,
            half: event.half
        })
        .then( doc => {
            if ( doc ) {
                //debug( doc );
                doc.out = event.out;
                doc.inning = event.inning;
                doc.half = event.half;
                doc.homeScore = event.homeScore;
                doc.awayScore = event.awayScore;
                doc.timeOfEvent = event.timeOfEvent;
                doc.projectedEndTime = event.projectedEndTime;
                doc.projectedMinutes = event.projectedMinutes;
                doc.startTime = event.startTime;
                doc.save().then(resolve).catch(e => {
                  debug(e, doc, event);
                  reject();  
                });
            } else {
                let model = this.model('Events');
                let e = new model({
                    game: this._id,
                    out: event.out,
                    inning: event.inning,
                    half: event.half,
                    homeScore: event.homeScore,
                    awayScore: event.awayScore,
                    timeOfEvent: event.timeOfEvent,
                    projectedEndTime: event.projectedEndTime,
                    projectedMinutes: event.projectedMinutes,
                    startTime: event.startTime,
                });
                e.save().then(resolve).catch(ee => {
                    debug(ee, e, event);
                    reject();  
                });
            }
        })        
    });
   
};

gc.statics.addGame = function( game ) {
    let _this = this;
    if (game.linescore.isTopInning !== true && game.linescore.isTopInning !== false) {
        game.linescore.isTopInning = true;
    }
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
                        gameDate: moment(game.gameDate),
                        link: game.link,
                        feed: 'http://end.inquisive.com:4244/gameFeed/' + game.gamePk,
                        status: game.status,
                        home: game.teams.home.team.abbreviation,
                        away: game.teams.away.team.abbreviation,
                        homeTeamShort: game.teams.home.team.shortName,
                        awayTeamShort: game.teams.away.team.shortName,
                        homeTeam: game.teams.home.team.name,
                        awayTeam: game.teams.away.team.name,
                        inning: game.linescore.currentInning,
                        half: game.linescore.inningHalf === 'Bottom' ? 2 : 1,
                        homeScore: game.teams.home.score,
                        awayScore: game.teams.away.score,
                        homeTeamData: game.teams.home,
                        awayTeamData: game.teams.away,
                        startTime: game.gameDate,
                        balls: game.linescore.balls,
                        strikes: game.linescore.strikes,
                        outs: game.linescore.outs,
                        offense: game.linescore.offense,
                        totalOuts: outs.outs,
                        projectedOuts: outs.projected,
                        isFinal: game.status.abstractGameCode === 'F' ? true : false,
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
                        officials : [],
                    } );
                    aa.save().then(resolve).catch(reject);
                } else {
                    doc.link = game.link;
                    doc.feed = 'http://end.inquisive.com:4244/gameFeed/' + game.gamePk;
                    doc.status = game.status;
                    doc.gameDate = moment(game.gameDate);
                    //doc.inning = game.linescore.currentInning;
                    //doc.half = game.linescore.inningHalf === 'Bottom' ? 2 : 1;
                    //doc.homeScore = game.teams.home.score;
                    //doc.awayScore = game.teams.away.score;
                    doc.isFinal = game.status.abstractGameCode === 'F' ? true : false;
                    //doc.balls = game.linescore.balls;
                    //doc.strikes = game.linescore.strikes;
                    //doc.outs = game.linescore.outs;
                    //doc.totalOuts = outs.outs;
                    //doc.projectedOuts = outs.projected;
                    //doc.review.hasChallenges = game.review.hasChallenges;
                    //doc.review.away.used = game.review.away.used;
                    //doc.review.away.remaining = game.review.away.remaining;
                    //doc.review.home.used = game.review.home.used;
                    //doc.review.home.remaining = game.review.home.remaining;
                    if (moment().unix() < moment(game.gameDate).unix()) {
                        doc.startTime = game.gameDate;
                    }
                    //debug(doc.half, game.linescore.inningHalf)
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
    projectedMinutes: Number,
    startTime: Date,
});

exports.GamePks = mongoose.model('GamePks', { 
    gamepk: String, 
    complete: { type: Boolean, default: false }
});

//const kitty = new Cat({ name: 'Zildjian' });
//kitty.save().then(() => console.log('meow'));