const End = require('./projection.js');
const debug = require('debug')('end');


let Projections = new End();

Projections.date = '2018-08-20';
let games = () => {
    Projections.addGames()
        .then( games => {
            console.log(Object.keys(Projections.games).length + ' games');
            //process.exit();
        })
        .catch(debug);
}

// events
let events = () => {
    Projections.addEvents().catch(debug);
}

//games();
events();

//setInterval(games, 30000);
//setInterval(events, 5000);

/** really bad ideas go down here **/

// forEach for objects
if (!Object.prototype.forEach) {
	Object.defineProperty(Object.prototype, 'forEach', {
		value: function (callback, thisArg) {
			if (this == null) {
				throw new TypeError('Not an object');
			}
			thisArg = thisArg || window;
			for (var key in this) {
				if (this.hasOwnProperty(key)) {
					callback.call(thisArg, this[key], key, this);
				}
			}
		}
	});
}