'use strict';

//let Util = require('util');  // Required only to log the data from the WebSocket connection
let redis = require('redis');
let WebSocketServer = require('ws').Server;


// You can pass in a port as an optional argument.  8080 is default.
let wsPort = 8080;
if (process.argv[2]) {
	wsPort = parseInt(process.argv[2]);
}
let wss = new WebSocketServer({ port: wsPort });

// This variable holds all the client websocket connections held by the server. 
let clients = {};

// ***********************************************************
// This section handles the subscription to redis
// ***********************************************************

let sub = redis.createClient();
let pub = redis.createClient();

sub.on("subscribe", (channel, count) => {
	console.log(`Channel Subscribed: ${channel}`);
});

sub.on("message", (channel, message) => {
	console.log(`Message Received: ${message}`);

	let data = JSON.parse(message);
	
	if (clients[data.target]) {
		clients[data.target].send(data.message);	
	}
});

// ***********************************************************
// This section creates the websockets and tracks connections
// ***********************************************************

wss.on('connection', (ws) => {

	let path = URL.parse(ws.upgradeReq.url, true).path;
	//console.log("URL: " + Util.inspect(path));

	let client_id = path.match(/ws\/v1\/(\w*)/)[1];
	console.log("New connection from: " + client_id);
	clients[client_id] = ws;

	ws.on('message', (data) => {

		console.log(data);

		if (data === 'ping') {
			ws.send('pong');
		}	
		else {
			pub.publish("websockets", data);
		}
	});

	ws.on('close', () => {
		console.log(`Closing connection with ${client_id}`);
		delete clients[client_id]
	});
});


sub.subscribe("websockets");


// Some cleanup that I'm not doing at all.  Unclear of the implications over time.
/*
	sub.unsubscribe();
	sub.quit();
	pub.quit();
	
*/

