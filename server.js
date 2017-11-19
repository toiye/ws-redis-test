'use strict'

const redis = require('redis')
const WebSocketServer = require('ws').Server
const parseUrl = require('parse-url')
const UUID = require('uuid')

const APP_DOMAIN = 'http://localhost'
const REDIS_HOST = '127.0.0.1'
const REDIS_PORT = 6379
const SERVER_ID = UUID.v4()

// You can pass in a port as an optional argument.  8080 is default.
let wsPort = 8080
if (process.argv[2]) {
	wsPort = parseInt(process.argv[2])
}
console.log(`Listening on Websocket Port: ${wsPort}`)
let wss = new WebSocketServer({ port: wsPort })

// This variable holds all the client websocket connections held by the server
let clients = {}
// This is a cached list of which servers hold connections to which users
let allConnectedClients = {}

// ***********************************************************
// This section handles the subscription to redis
// ***********************************************************

// You need two clients to subscribe and publish.  Can't be the same one.
let sub = redis.createClient(REDIS_PORT, REDIS_HOST)
let pub = redis.createClient(REDIS_PORT, REDIS_HOST)

sub.on("subscribe", (channel, count) => {
	console.log(`Channel Subscribed: ${channel}`)
})

sub.on("message", (channel, message) => {
	console.log(`Published message received:`, message)
	let data = JSON.parse(message)

	if (data.command === 'refresh_active_clients') {
		pub.publish("myChannel", JSON.stringify({
			command: 'store_active_clients',
			server_id: SERVER_ID,
			clients: Object.keys(clients),
		}))
		return
	}

	if (data.command === 'store_active_clients') {
		allConnectedClients[data.server_id] = data.clients
		return
	}

	if (clients[data.target]) {
		clients[data.target].send(JSON.stringify({
			message: data.message
		}))
		return
	}
})

// ***********************************************************
// This section creates the websockets and tracks connections
// ***********************************************************

wss.on('connection', (ws) => {
	const urlData = parseUrl(`${APP_DOMAIN}${ws.upgradeReq.url}`)
	let clientId

	// Match a path of /ws/v1?id=clientId
	if (urlData && urlData.pathname === '/ws/v1') {
		if (urlData.query && urlData.query.id) {
			clientId = urlData.query.id
		}
		else {
			ws.send(JSON.stringify({
				message: "You need to pass in an 'id' query parameter"
			}))
			return
		}
	}
	else {
		console.log("urlData", urlData)
		// The connection wasn't for us
		return
	}

	console.log("New connection from: " + clientId)
	clients[clientId] = ws
	console.log(`Current list of connections: ${Object.keys(clients)}`)

	ws.on('message', (data) => {

		let message
		try {
			message = JSON.parse(data)
		}
		catch(err) {
			ws.send(JSON.stringify({
				message: "You need to send messages in JSON format"
			}))
			return
		}

		// Expects messages to be in the form:
		// {
		//	command: send_message,
		// 	target: 123,
		// 	message: "Some string or object"
		// }

		console.log("Received Message:", message, "from clientId:", clientId)

		// Just a websocket test
		if (message.command === 'ping') {
			ws.send(JSON.stringify({ response: 'pong' }))
		}
		// Tell all the other servers to publish their list
		else if (message.command === 'refresh_active_clients') {
			pub.publish('myChannel', JSON.stringify({command: 'refresh_active_clients'}))
		}
		// Return the most recently cached list of servers and clients
		else if (message.command === 'get_active_clients') {
			ws.send(JSON.stringify(allConnectedClients))
		}
		else if (message.command === 'send_message') {
			pub.publish("myChannel", data)
		}
	})

	ws.on('close', () => {
		console.log(`Closing connection with ${clientId}`)
		delete clients[clientId]
	})
})

sub.subscribe("myChannel")
pub.publish('myChannel', JSON.stringify({command: 'refresh_active_clients'}))

// Some cleanup that I'm not doing at all.  Unclear of the implications over time.
/*
	sub.unsubscribe()
	sub.quit()
	pub.quit()

*/
