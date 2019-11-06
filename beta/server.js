var http = require("http");
var ws = require("websocket-server");

var connected = 0;
var server = ws.createServer();

server.addListener("listening", function(){
});

// Handle WebSocket Requests
server.addListener("connection", function(conn){
  
  connected++;
  server.send(conn.id, connected+'');
  conn.broadcast(connected+'');
  
  conn.addListener("message", function(message){
    conn.broadcast(message);
  });
});

server.addListener("close", function(conn){
  connected--;
  conn.broadcast(connected+'');
});

server.listen( 1337);

