const End = require('./projection.js');
const debug = require('debug')('end:index');
const express = require('express');
const app = express();
const port = process.env.PORT || 4244;
const portS = process.env.PORT || 4442;
const Routes = require('./routes.js'); 
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const Sockets = require('socket.io');

const sslOptions = {
	key: fs.readFileSync('/home/snow/domains/trackers.inquisive.com/ssl.key'),
	cert: fs.readFileSync('/home/snow/domains/trackers.inquisive.com/ssl.cert')
};

app.use(require('helmet')());
app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
  });
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

Routes(app);

app.listen(port);

let server = https.createServer(sslOptions, app);
let io = Sockets(server);
server.listen(portS, () => {
	//console.log('API server started on: ' + port);

	let Projections = new End();

	Projections.addSockets(io);

	//Projections.date('20180827');
	//Projections.runAlways = true;
	let games = () => {
		Projections.date();
		Projections.addGames()
					.then( games => {
							//debug(Object.keys(games).length + ' games');
							//process.exit();
					})
					.catch(debug);
	}

	// events
	let events = () => {
		Projections.addEvents().catch(debug);
	}

	games();
	//events();

	setTimeout(() => setInterval(games, 3000000), 5000)
	setInterval(events, 10000);
	
	
});



