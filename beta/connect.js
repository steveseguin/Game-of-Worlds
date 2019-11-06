server = "ws://107.21.126.134:1337";

// creating a WebSocket object causes it
// to connect to the server
websocket = new WebSocket(server);
 
// called once the connection is established
websocket.onopen = function(evt) {
    document.getElementById("chat").style.visibility = 'visible';
    document.getElementById("status").innerHTML = "Connected";
};
 
// called upon receipt of a message
websocket.onmessage = function(evt) {
    if (evt.data.indexOf("$^$")==0){ 
    		document.getElementById("connected").innerHTML = evt.data.split("$^$")[1];
	}
    else if (evt.data.indexOf("sector:")==0){
		
	        document.getElementById('mainsector').style.backgroundImage='url(planet'+evt.data.split(":")[6]+'.png)';
	        document.getElementById('planetname').innerHTML='Name: fixthis';
	        document.getElementById('planetsize').innerHTML='Type: '+evt.data.split(":")[6];
	        document.getElementById('planetenviro').innerHTML='Environment: fix this';
	        document.getElementById('planetunique').innerHTML='Unique: fix this';
        }
    else {
		document.getElementById("log").innerHTML += evt.data+"<br>";
	}
};
 
// called when an error occurs
websocket.onerror = function(evt) {
    document.getElementById("status").innerHTML = "ERROR: "+evt.data +"<br>";
};
 
// called when the connection is closed (by either side)
websocket.onclose = function() {
    document.getElementById("status").innerHTML = "Connection closed";
};

function sendChat() {
	event.preventDefault();  // prevents the form onsubmit event from reloading the page like it does by default
	websocket.send(document.getElementById("chat").value);  // send the data over websocketsdocument.getElementById("chat")document.getElementById("chat")document.getElementById("chat")
	document.getElementById("chat").value = "";  // reset the chat input field
}
function changeSector(sect) {
		websocket.send("//sector "+sect);
}
