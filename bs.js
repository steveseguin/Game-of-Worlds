var WebSocketServer = require('websocket').server;
var http = require('http');
var url = require('url');
var fs = require('fs');


var mysql = require('mysql');

var client = mysql.createClient({
  user: 'root',
  password: 'bitnami',
  host: '127.0.0.1',
});

client.query('USE game');

console.log("WebSocket-Node: echo-server");

var server = http.createServer(function(request, response) {
    console.log((new Date()) + " Received request for " + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(1337, function() {
    console.log((new Date()) + " Server is listening on port 1337");
});

wsServer = new WebSocketServer({
    httpServer: server,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: true,
    disableNagleAlgorithm: false,
    autoAcceptConnections: true
});


clients=[];
gameTimer=[];
cid=[];
turns=[];
map=[];

wsServer.on('connect', function(connection) {
    connection.name='unknown';
    clients.push(connection);

    console.log((new Date()) + " Connection accepted" + " - Protocol Version " + connection.webSocketVersion);
    for (var i in clients){
           clients[i].sendUTF("$^$"+clients.length);
    }
	console.log("there are "+clients.length+" clients connected");

    connection.on('message', function(message) {
	console.log("Incoming: "+message.utf8Data);
        if (message.type === 'utf8' && connection.name=='unknown'){
		if (message.utf8Data.indexOf("//auth:")===0){
			console.log("Auth attempt");
			authUser(message,connection);
		}
		else {
			console.log("someone is poking the server");
			connection.close();
		}
	}
	else if (message.type === 'utf8'){
	    if (message.utf8Data.indexOf("//start")===0){
		if (turns[connection.gameid]===undefined){
		    console.log("game has not started yet. will start");
		    turns[connection.gameid]=0;		
		    for (var i in clients){
			   if (clients[i].gameid==connection.gameid){
				client.query('UPDATE games SET turn = 0 WHERE id = "'+connection.gameid+'"');
				clients[i].sendUTF("The game is starting in 10 seconds");
				clients[i].sendUTF("start10:");
			   }
    		    }
		    var starttimer = setTimeout(function() {startGame(connection.gameid);},10000);
		    console.log("game: "+connection.gameid+" has been started.");		
		}
		else if (turns[connection.gameid]!=0){
			var readystatus=0;
			connection.ready=1;
			for (var i in clients){
				if (clients[i].gameid==connection.gameid && clients[i].ready==1){
					readystatus=1;
					console.log("player "+clients[i].name+" is ready");
				}
				else if (clients[i].gameid==connection.gameid){
					console.log("player "+clients[i].name+" is not ready; no next turn");
					readystatus=0;
					break;
				}
			}
			if (readystatus){
				console.log("good to go on next turn.");
				for (var i in clients){
					if (clients[i].gameid==connection.gameid){
	                                        clients[i].ready=0;;
        	                        }
				}
				clearInterval(gameTimer[connection.gameid]);
				gameTimer[connection.gameid]=setInterval(function() {nextTurn(connection.gameid);},180000);
				nextTurn(connection.gameid);
			}
			readystatus=0;
			
		}
		else { 
			console.log("Game is starting. Can't start next round yet.");
		}
	    }
	    else if (message.utf8Data.indexOf("//colonize")===0){
		colonizePlanet(connection);
	    }
	    else if (message.utf8Data.indexOf("//buytech:")===0){
                buyTech(message,connection);
            }
            else if (message.utf8Data.indexOf("//probe:")===0){
                probeSector(message,connection);
            }
            else if (message.utf8Data.indexOf("//buyship:")===0){
                buyShip(message,connection);
            }
            else if (message.utf8Data.indexOf("//buybuilding:")===0){
                buyBuilding(message,connection);
            }
            else if (message.utf8Data.indexOf("//move:")===0){
	    }
	    else if (message.utf8Data.indexOf("//sector tile")===0){
		updateSector(message,connection);
            }
	    else if (message.utf8Data.indexOf("//mmove:")===0){
		surroundShips(message,connection);
	    }
            else if (message.utf8Data.indexOf("//sendmmf:")===0){
                preMoveFleet(message,connection);
            }
    	    else if (message.utf8Data.indexOf("//update")===0){
		updateResources(connection);
	    }
            else {
                console.log("Received utf-8 message of " + message.utf8Data.length + " characters.");
                    for (var i in clients){
                           if (clients[i].gameid==connection.gameid){
                                clients[i].sendUTF("Player "+connection.name+" says: "+message.utf8Data);
                           }
                    }
            }
        }
	else {
	    console.log("non-UTF data recieved. close connection");
	    connection.close();
	}
    });
    connection.on('close', function(reasonCode, description) {
        var i = clients.indexOf(connection);
        clients.splice(i,1);
	if (cid[connection.name]!==undefined){
		i = cid.indexOf(connection.name);
		cid.splice(i,1);
	}
        console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");

	var playerlist="pl";
        for (var i in clients){
                        clients[i].sendUTF("$^$"+clients.length);
                        if (clients[i].gameid==connection.gameid  && connection.name!=clients[i].name && connection!=clients[i]){
                                playerlist=playerlist+":"+connection.name;
                        }
                }
        for (var i in clients){
                if (clients[i].gameid==connection.gameid && playerlist!="pl"){
                        clients[i].sendUTF(playerlist);
                }
        }

    });
});

function surroundShips(message, connection){
	msid = parseInt(message.utf8Data.split(":")[1],16);
	client.query('SELECT * FROM map'+connection.gameid,
                function (err, results, fields) {
                         if (err) {
                                throw err;
                         }
			sendchunk='';
			for (i in results){
			   mapa = results[i];
			   if (mapa['ownerid']==connection.name && (mapa['totalship1'] || mapa['totalship2'] || mapa['totalship3'] || mapa['totalship4'] || mapa['totalship5'] || mapa['totalship6'])){	
				if ((msid-1)%16 > 8 && msid%16 != 0 ){
				        if (mapa['sectorid']+1 == msid || mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+9 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-7 == msid){
                                	        sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                	}
				}
				else if ((msid-1)%16 < 7 && msid%16 != 1){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+7 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-9 == msid){
                                                sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                        }
                                }
				else if (msid%16==1){
				        if (mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+7 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-9 == msid){
                                                sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                        }	
				}
				else if (msid%16==0){
					if (mapa['sectorid']+1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+9 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-7 == msid){
                                                sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                        } 
				}
                                else if (msid%8==0){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']-8 == msid){
                                                sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                        }
				}
				else {
                                        if (mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']-8 == msid){
                                                sendchunk+=":"+mapa['sectorid'].toString(16)+":"+mapa['totalship1']+":"+mapa['totalship2']+":"+mapa['totalship3']+":"+mapa['totalship4']+":"+mapa['totalship5']+":"+mapa['totalship6'];
                                        }	
				}
			   }
			}
			if (sendchunk==""){
				connection.sendUTF('You have no ships in nearby sectors.');
			}
			else {
				console.log(sendchunk);
				connection.sendUTF('mmoptions:'+msid.toString(16)+sendchunk);
			}
		}
	);
}
function preMoveFleet(message,connection){
 console.log(message);
 arr = message.utf8Data.split(":");
 msid = parseInt(message.utf8Data.split(":")[1],16);
 client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = '+connection.name+' LIMIT 1',
  function (err, resultsp, fields) {
        if (err) {
             throw err;
        }
	resultp=resultsp[0];
	sumofships=0;
	for (y=4;y<=(arr.length-1);y+=3){
		if (parseInt(arr[y-1])==1){
			sumofships+=parseInt(arr[y]*2);
		}
		else if (parseInt(arr[y-1])==2){
			sumofships+=parseInt(arr[y]*3);
		}
                else if (parseInt(arr[y-1])==3){
                        sumofships+=parseInt(arr[y]*1);
                }
                else if (parseInt(arr[y-1])==4){
                        sumofships+=parseInt(arr[y]*2);
                }
                else if (parseInt(arr[y-1])==5){
                        sumofships+=parseInt(arr[y]*3);
                }
                else if (parseInt(arr[y-1])==6){
                        sumofships+=parseInt(arr[y]*2);
                }
	}
	if (sumofships*100>resultp['crystal']){
	  console.log('sumofships'+sumofships);
	  connection.sendUTF('You do not have enough crystal to send this fleet. Needed:'+(sumofships*100));
	}
	else {
           client.query('SELECT * FROM map'+connection.gameid,
                function (err, results, fields) {
                         if (err) {
                                throw err;
                         }
			s1=0;
			s2=0;
			s3=0;
			s4=0;
			s5=0;
			s6=0;
			gotoHere = msid;
			for (i in results){
                          mapa = results[i];
			  if (mapa['sectorid']==msid){
				resultsx=mapa;
			  }
                          if (mapa['ownerid']==connection.name){
			    for (x=2;x<=(arr.length-1);x+=3){
			      if (parseInt(arr[x],16)==mapa['sectorid'] && arr[x+2]!=undefined && arr[x+1]!=undefined){
                                if ((msid-1)%16 > 8 && msid%16 != 0 ){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+9 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-7 == msid){
						if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
							s1+=parseInt(arr[x+2]);
							mapa['totalship1']-=parseInt(arr[x+2]);
						}
						else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
                                else if ((msid-1)%16 < 7 && msid%16 != 1){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+7 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-9 == msid){
                                                if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
                                                        s1+=parseInt(arr[x+2]);
                                                        mapa['totalship1']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
                                else if (msid%16==1){
                                        if (mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+7 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-9 == msid){
                                                if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
                                                        s1+=parseInt(arr[x+2]);
                                                        mapa['totalship1']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
                                else if (msid%16==0){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']+9 == msid || mapa['sectorid']-8 == msid || mapa['sectorid']-7 == msid){
                                                if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
                                                        s1+=parseInt(arr[x+2]);
                                                        mapa['totalship1']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
                                else if (msid%8==0){
                                        if (mapa['sectorid']+1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']-8 == msid){
                                                if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
                                                        s1+=parseInt(arr[x+2]);
                                                        mapa['totalship1']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
                                else {
                                        if (mapa['sectorid']-1 == msid || mapa['sectorid']+8 == msid || mapa['sectorid']-8 == msid){
                                                if (mapa['totalship1']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==1){
                                                        s1+=parseInt(arr[x+2]);
                                                        mapa['totalship1']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship2']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==2){
                                                        s2+=parseInt(arr[x+2]);
                                                        mapa['totalship2']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship3']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==3){
                                                        s3+=parseInt(arr[x+2]);
                                                        mapa['totalship3']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship4']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==4){
                                                        s4+=parseInt(arr[x+2]);
                                                        mapa['totalship4']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship5']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==5){
                                                        s5+=parseInt(arr[x+2]);
                                                        mapa['totalship5']-=parseInt(arr[x+2]);
                                                }
                                                else if (mapa['totalship6']>=parseInt(arr[x+2]) && parseInt(arr[x+1])==6){
                                                        s6+=parseInt(arr[x+2]);
                                                        mapa['totalship6']-=parseInt(arr[x+2]);
                                                }
                                        }
                                }
			      }
                            }
			  }
			  client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+mapa['totalship1']+', totalship2 = '+mapa['totalship2']+', totalship3 = '+mapa['totalship3']+', totalship4 = '+mapa['totalship4']+', totalship5 = '+mapa['totalship5']+', totalship6 = '+mapa['totalship6']+' WHERE sectorid = "'+mapa['sectorid']+'" LIMIT 1');
			}
			console.log('tot ships send:'+(s1+s2+s3+s4+s5+s6));
	                totcrystalcost = (s1*2+s2*3+s3+s4*2+s5*3+s6*2)*100;
			if (totcrystalcost>0){
	                      	client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+totcrystalcost+' WHERE playerid = '+connection.name);
				setTimeout(endTravel, 15000, s1,s2,s3,s4,s5,s6,connection.name,connection.gameid,resultsx,resultsp,gotoHere,connection);
				connection.sendUTF("Our fleet successfully departed at a cost of "+totcrystalcost+" crystal and should arrive in sector "+gotoHere.toString(16)+" in 15 seconds.");
			}
			else {
				connection.sendUTF("You did not select any ships to move.  Please try again");
			} 
                }
           );
        }
    }
 );
}


function endTravel(s1,s2,s3,s4,s5,s6,pID,gID,resultsx,resultsp,gotoHere,connection){
	client.query('SELECT * FROM players'+gID+' WHERE playerid = '+pID+' LIMIT 1',
  		function (err, resultsp, fields) {
  		      	if (err) {
        	     		throw err;
        		}
			console.log('end travel function ready');
        		resultp=resultsp[0];			
					endtravel=1;
					if (resultsx['sectortype']==1){
						connection.sendUTF('Fleet arrived in sector "+gotoHere.toString(16)+"... but the sector contained a blackhole! UH-OH! Our fleet was crushed by the immense gravity of the black hole!');
						updateAllSectors(gID,connection);
                                            	updateResources(connection);
						connection.sendUTF("info:"+gotoHere.toString(16)+":1");
					}
                                        else if (resultsx['sectortype']==2 && resultsx['ownerid']!=pID){
				    	    starttravel=s1+s2+s3+s4+s5+s6;
					    s1 = Math.round(s1*Math.random());
                                            s2 = Math.round(s2*Math.random());
                                            s3 = Math.round(s3*Math.random());
                                            s4 = Math.round(s4*Math.random());
                                            s5 = Math.round(s5*Math.random());
                                            s6 = Math.round(s6*Math.random());
					    endtravel=s1+s2+s3+s4+s5+s6;
						if (0==endtravel){
							connection.sendUTF('Our fleet warped into an asteroid belt and were hit hard. Ouch! We lost are entire fleet!');
							updateAllSectors(gID,connection);
                                               		updateResources(connection);
						}
						else if (endtravel==starttravel){
							connection.sendUTF('Our fleet warped into an asteroid belt, but we avoided being hit. Whew!  As long as we control this sector, we should be safe to move more ships in.');
						}
						else {
							connection.sendUTF('Our fleet warped into an asteroid belt and were hit hard. Ouch! We lost '+(starttravel-endtravel)+' ships.  If we can control the sector though, that should not happen to us again.');
						}
						connection.sendUTF("info:"+gotoHere.toString(16)+":0");
                                        }
					if (endtravel==0){
					}
                                	else if (resultsx['ownerid']==0){
							client.query('UPDATE map'+gID+' SET totalship1 = '+s1+', totalship2 = '+s2+', totalship3 = '+s3+', totalship4 = '+s4+', totalship5 = '+s5+', totalship6 = '+s6+', ownerid = '+pID+' WHERE sectorid = '+gotoHere);
							if (resultsx['sectortype']!=2){
                                		        	console.log('sector untaken. take it');
								connection.sendUTF('Fleet moved; you took control of the sector without issue. ');
							}
							updateAllSectors(gID,connection);
							updateResources(connection);
                                        }
           		                else if (resultsx['ownerid']==pID){
 	                                        	client.query('UPDATE map'+gID+' SET totalship1 = totalship1 + '+s1+', totalship2 = totalship2 + '+s2+', totalship3 = totalship3 +  '+s3+', totalship4 = totalship4 + '+s4+', totalship5 = totalship5 + '+s5+', totalship6 = totalship6 + '+s6+' WHERE sectorid = '+gotoHere);
		                	                console.log('sector yours. move freely');
							connection.sendUTF('Fleet moved sucessfully.');
							updateAllSectors(gID,connection);
							updateResources(connection);
                               			}
		                        else if (resultsx['ownerid']===undefined){
                		                            console.log('ERROR 324!');
     	        	                }
 		                        else { 
								defenderid=resultsx['ownerid'];
							        for (var ib in resultsp){
                                              			       	resultdd=resultsp[ib];
                                                       			if (resultdd['playerid'] == defenderid){break;}
                                               			}
						console.log('An attack is taking place.');
						ispp=0;
						battle='battle';

/// attackers tech info is in resultp[]
/// defenders tech info is in resultdd[]

AWL = resultp['tech4']; 	 // attacker's weapon tech level (ie: no weapon tech is then 0)
DWL = resultdd['tech4']; 	 //attacker's weapon tech level

DSL = resultdd['tech6'];	//defender's shield's level (ie: 1)
ASL = resultp['tech6']; 	//attack's shield's level
	
a1=[];
a2=[];
a3=[];
a4=[];
a5=[];
a6=[];

for (tmp=0;tmp<s1;tmp++){
	a1[tmp]=Math.pow(1.1,resultp['tech5']);
} 
for (tmp=0;tmp<s2;tmp++){
        a2[tmp]=2*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s3;tmp++){
        a3[tmp]=Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s4;tmp++){
        a4[tmp]=2*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s5;tmp++){
        a5[tmp]=3*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s6;tmp++){
        a6[tmp]=Math.pow(1.1,resultp['tech5']);
}

////////////////////////

d1=[];
d2=[];
d3=[];
d4=[];
d5=[];
d6=[];

d7 = resultsx['groundturret'];
d8 = resultsx['orbitalturret'];

for (tmp=0;tmp<resultsx['totalship1'];tmp++){
        d1[tmp]=Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship2'];tmp++){
        d2[tmp]=2*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship3'];tmp++){
        d3[tmp]=Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship4'];tmp++){
        d4[tmp]=2*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship5'];tmp++){
        d5[tmp]=3*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship6'];tmp++){
        d6[tmp]=Math.pow(1.1,resultdd['tech5']);
}


///////////////////////////

											
DOS = d8; // total shots from defender's orbitals this round. no tech bonus. no hitpoints. non-changing since orbitals cant be destroyed.

battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
console.log('battle:'+battle);
var stopvar = 0;
while (stopvar == 0){
	
	///  destroyers and dreadnoughts do multiple hits; not one large chunk of damage.  

	ATS = a1.length + a2.length*2 + a4.length + a5.length*3;   // attackers total shots per round (changes)
	DTS = d1.length + d2.length*2 + d4.length + d5.length*3;   // defenders total shots per round from ships (changes);
	console.log(ATS+":A vs D:"+DTS);
	//////////////////// Attacker's Turn to hit.
	if (ATS>0) {	                                  		// for each enemy shot do the following...
		console.log("ATS>0");
		while (ATS>0 && d1.length>0){           		// See what shots first hit defender's corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,DSL)) ){  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				d1[d1.length-1]-=Math.pow(1.1,AWL);  		// hit a corvette for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			ATS--;                   	 		// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d1[d1.length-1]<=0) {   	 		// check to see if that ship has lost all hitpoints
				d1.splice(d1.length-1,1);  		// if it has, remove that ship from the battle.
			}	
		}		
	
		while (ATS>0 && d2.length>0){		 			// Assuming shots left and defender has destroyers, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d2[d2.length-1]-=Math.pow(1.1,AWL);  			// hit a destroyer for 1 shot (1.1 dmg in this case)
			}	
			ATS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d2[d2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				d2.splice(d2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}		
	
	
		while (ATS>0 && d4.length>0){		 			// Assuming shots left and defender has crusiers, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d4[d4.length-1]-=Math.pow(1.1,AWL);  			// hit a crusier for 1 shot (1.1 dmg in this case)
			}	
			ATS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d4[d4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				d4.splice(d4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}		
	
		while (ATS>0 && d5.length>0){		 				// Assuming shots left and defender has dreadnought, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))*(0.9*Math.pow(0.95,DSL))){  	// if random is less than the chance to hit... hit.  	
											// if the shot accuracy (0 to 1.0) is greater than the double shield mod+base...
				d5[d5.length-1]-=Math.pow(1.1,AWL); 				// hit the dreadnought for 1 shot (1.1 dmg in this case)
					
			}
			ATS--;                   	 				// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d5[d5.length-1]<=0) {   	 				// check to see if that ship has lost all hitpoints
				d5.splice(d5.length-1,1);  				// if it has, remove that ship from the battle.
			}	
		}
			
		while (ATS>0 && d3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			d3[d3.length-1]-=Math.pow(1.1,AWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			ATS--;                   	 	// reduce the number of shots remaining by 1
			if (d3[d3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				d3.splice(d3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		
		while (ATS>0 && d6.length>0){		 	// Assuming shots left and defender has colonyship, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d6[d6.length-1]-=Math.pow(1.1,AWL); 		// hit the colony ship for 1 shot (1.1 dmg in this case)
			}
			ATS--;                   	 	// reduce the number of shots remaining by 1, even if deflected
			if (d6[d6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				d6.splice(d6.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
	
		while (ATS>0 && d7>0){		 	// Assuming shots left and defender has ground turrets (or a colonized planet), do the following...
			d7-=Math.pow(1.1,AWL); 		// hit the planet for 1 shot (1.1 dmg in this case)
			ATS--;                   	// reduce the number of shots remaining by 1
			if (d7<0) {   		 	// check to see if the ground defense has been overrun
				d7=0;		  	// if it has,  Sector is free for the taking if d7=0 and if there are no defending ships still alive.
			}	
		}
	}
	
	////////////////  Defender's turn to hit.
	
	if (DTS+DOS>0) {         						// the defending ships/planet now get to take their shots on the incoming attackers... assuming they have shots to be made.
		console.log("DTS+DOS>0");
		while (DTS>0 && a1.length>0){            			// See what shots hit attackers corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) ) ){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a1[a1.length-1]-=Math.pow(1.1,DWL);  			// hit a corvette for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a1[a1.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a1.splice(a1.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a1.length>0){            			// See what orbital shots hit attacks corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a1[a1.length-1]--;  				// hit a corvette for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a1[a1.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a1.splice(a1.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	       								
		while (DTS>0 && a2.length>0){            			// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a2[a2.length-1]-=Math.pow(1.1,DWL);  			// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a2[a2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a2.splice(a2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a2.length>0){            			// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a2[a2.length-1]--;  				// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a2[a2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a2.splice(a2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a4.length>0){            			// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a4[a4.length-1]-=Math.pow(1.1,DWL);  			// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a4[a4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a4.splice(a4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a4.length>0){            			// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a4[a4.length-1]--;  				// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a4[a4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a4.splice(a4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a5.length>0){            						// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL)) * (0.9*Math.pow(0.95,ASL))) {  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a5[a5.length-1]-=Math.pow(1.1,DWL);  					// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 						// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a5[a5.length-1]<=0) {   	 						// check to see if that ship has lost all hitpoints
				a5.splice(a5.length-1,1);  						// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a5.length>0){            						// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL))*(0.9*Math.pow(0.95,ASL))) {  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a5[a5.length-1]--;  							// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}		
			DOS--;          		         	 				// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a5[a5.length-1]<=0) {   			 				// check to see if that ship has lost all hitpoints
				a5.splice(a5.length-1,1);  						// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			a3[a3.length-1]-=Math.pow(1.1,DWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			DTS--;                   	 	// reduce the number of shots remaining by 1
			if (a3[a3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a3.splice(a3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			a3[a3.length-1]--; 			// hit the scout for 1 shot (1.1 dmg in this case)
			DOS--;                   	 	// reduce the number of shots remaining by 1
			if (a3[a3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a3.splice(a3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a6.length>0){		 	// Assuming shots left and defender has scout, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a6[a6.length-1]-=Math.pow(1.1,DWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			}
			DTS--;                   	 	// reduce the number of shots remaining by 1
			if (a6[a6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a6.splice(a6.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a6.length>0){		 	// Assuming shots left and defender has colonyship, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a6[a6.length-1]--; 			// hit the colony ship for 1 shot (1.1 dmg in this case)
			}
			DOS--;                   	 	// reduce the number of shots remaining by 1
			if (a6[a6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a6.splice(a6.length-1,1);  	// if it has, remove that ship from the battle.
			}
		}		
	
	}
	/////// check to see if anyone won this round of battle
	if ((a1.length + a2.length + a3.length + a4.length + a5.length + a6.length)==0) {   /// if true, all attacking ships are dead. Defender auto-win.
		client.query('UPDATE map'+gID+' SET totalship1 = '+d1.length+', totalship2 = '+d2.length+', totalship3 = '+d3.length+', totalship4 = '+d4.length+', totalship5 = '+d5.length+', totalship6 = '+d6.length+' WHERE sectorid = '+gotoHere);
		connection.sendUTF('All our ships were destroyed.  We lost the battle.');
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
		connection.sendUTF("info:"+gotoHere.toString(16)+":"+3);
                for (mm in clients){
                        if (clients[mm].gameid==gID){
                                if (clients[mm].name!=pID && defenderid==clients[mm].name){
                                        clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+", yet we won the battle.");
                                        clients[mm].sendUTF(battle);
                                        updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
                                }
                                else if (clients[mm].name!=pID){
                                        clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
                                }
                        }
                }

                                                                                                                     updateAllSectors(gID,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);

		break;	
	}
	else if ((d1.length + d2.length + d3.length + d4.length + d5.length + d6.length + d7)==0) {   /// if true, all defenders are out of hitpoints or sector uncolonized/defended, yet attackers still alive. Sector captured.
		client.query('UPDATE map'+gID+' SET totalship1 = '+a1.length+', totalship2 = '+a2.length+', totalship3 = '+a3.length+', totalship4 = '+a4.length+', totalship5 = '+a5.length+', totalship6 = '+a6.length+', ownerid = '+pID+', colonized = 0, groundturret = 0, orbitalturret = 0, academylvl = 0, shipyardlvl = 0, metallvl = 0, crystallvl = 0, totship1build = 0, totship2build = 0, totship3build = 0, totship4build = 0, totship5build = 0, totship6build = 0 WHERE sectorid = '+gotoHere);
		connection.sendUTF('We captured the sector.');
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
                for (mm in clients){
                        if (clients[mm].gameid==gID){
                                if (clients[mm].name!=pID && defenderid==clients[mm].name){
                                        clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+" and we lost the battle.");
                                        clients[mm].sendUTF(battle);
					clients[mm].sendUTF("info:"+gotoHere.toString(16)+":"+3);
                                        updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
                                }
                                else if (clients[mm].name!=pID){
                                        clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
                                }
                        }
                }
		                                                                                                     updateAllSectors(gID,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);
		break;
	}
	else if ((a1.length + a2.length + a4.length + a5.length)==0) {   // if true, attackers have no more firepower, yet defenders are still alive... with something, so defenders auto win.
		client.query('UPDATE map'+gID+' SET totalship1 = '+d1.length+', totalship2 = '+d2.length+', totalship3 = '+d3.length+', totalship4 = '+d4.length+', totalship5 = '+d5.length+', totalship6 = '+d6.length+' WHERE sectorid = '+gotoHere);
		connection.sendUTF("We tried to retreat from an enemy's sector, but were destroyed."); 
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
		connection.sendUTF("info:"+gotoHere.toString(16)+":"+3);
		for (mm in clients){
			if (clients[mm].gameid==gID){
				if (clients[mm].name!=pID && defenderid==clients[mm].name){
					clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+", yet we won the battle.");
					clients[mm].sendUTF(battle);
					updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
				}
				else if (clients[mm].name!=pID){
					clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
				}
			}
		}
                        updateAllSectors(gID,connection);
                        updateResources(connection);
                        updateSector2(connection.sectorid, connection);

		break;
	}	
	//otherwise, just keep repeating everything again until there is a winner or loser....
    }
    ///////////////////////////////////////////////////////// END BATTLE MECHANIC
   }
  }
 );
}

function colonizePlanet(connection){
	if (connection.sectorid != undefined){
        client.query('SELECT * FROM map'+connection.gameid+' where sectorid = "'+connection.sectorid+'" LIMIT 1',
                function (err, resultsm, fields) {
                         if (err) {
                                throw err;
                         }
			 resultm = resultsm[0];

			 if (resultm['totalship6']>0 && resultm['ownerid']==connection.name && resultm['sectortype']>5 && resultm['colonized']!=1){ 
			 client.query('SELECT * FROM players'+connection.gameid+' where playerid = "'+connection.name+'" LIMIT 1',
        		        function (err, resultsp, fields) {
        		                 if (err) {
        		                        throw err;
        		                 }
        		                 resultp = resultsp[0];
					 if (resultp['tech7']>=resultm['terraformlvl']){
						connection.sendUTF('Colonization of sector successful!');
						client.query('UPDATE map'+connection.gameid+' SET colonized = 1, terraformlvl = 0, totalship6 = totalship6 - 1 WHERE sectorid = "'+connection.sectorid+'" LIMIT 1'); 
					 }
					 else {
						connection.sendUTF('You do not have a high enough terraforming tech to colonize this sector.');
					 }
        		        }
        		);
			}
			else if (resultm['colonized']==1){
				connection.sendUTF('This sector is already colonized by you.');
			}
			else if (resultm['totalship6']<1){
				connection.sendUTF('There are no colony ships in this sector.');
			}
			else if ( resultm['sectortype']<=5 ){
				connection.sendUTF("There are no planets in this sector. You cannot colonize or terraform it.");
			}
			else {connection.sendUTF('You do not control this sector. Error.');}
                }
        );
	}
	else {connection.sendUTF('No sector specified. Error.');}
}
function updateResources(connection){
        client.query('SELECT * FROM players'+connection.gameid+' where playerid = "'+connection.name+'" LIMIT 1',
                function (err, results, fields) {
                         if (err) {
                              	throw err;
                         }
                         var result = results[0];
                         connection.sendUTF('resources:'+result['metal']+':'+result['crystal']+':'+result['research']);
 			 connection.sendUTF("tech:"+result['tech1']+":"+result['tech2']+":"+result['tech3']+":"+result['tech4']+":"+result['tech5']+":"+result['tech6']+":"+result['tech7']+":"+result['tech8']+":"+result['tech9']);
                }
        );

}
function probeSector(message,connection){
	console.log('probe? check resources first');
	 client.query('SELECT * FROM players'+connection.gameid+' where playerid = "'+connection.name+'" LIMIT 1',
                function (err, results, fields) {
                         if (err) {
                                throw err;
                         }
                         var result = results[0];
                         if (result['crystal']>=300){
				client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - 300 WHERE playerid = "'+connection.name+'"' );
				updateSectorProbe(message.utf8Data.split("//probe:")[1], connection);
			 }
			 else {
				connection.sendUTF('Not enough Crystal to send a probe.');
			 }
                }
        );
}
function updateSectorProbe(sect2update, connection){
                client.query('SELECT * FROM map'+connection.gameid+' WHERE sectorid = '+sect2update+' LIMIT 1',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
	                        console.log("sector update");
        	                results=results[0];

				if (results['ownerid']==0){
					owner="no one";
				        if (results['sectortype']>5){
                                	        connection.sendUTF("Our probe was unable to detect enemy life in sector "+sect2update.toString(16)+", but the sector does contain a colonizable planet with a metal production rate of "+results['metalbonus']+"% and a crystal output rate of "+results['crystalbonus']+"%.");
	                                }
					else if (results['sectortype']<2){
						connection.sendUTF("Our probe was destroyed when entering sector "+sect2update.toString(16)+".  No information was gathered.");
					}
        	                        else {
                	                        connection.sendUTF("Our probe was unable to detect enemy life in sector "+sect2update.toString(16)+", nor any colonizable planets.");
                        	        }
				}
				else {
					owner=results['ownerid'];
					client.query('SELECT * FROM players'+connection.gameid,
        			        	function (err, resultsp, fields) {
                        			 if (err) {
                        			      console.log("QUERY FAILED");
                        			      throw err;
                        			 }
						 for (r in resultsp){
							resultp = resultsp[r];
							if (resultp['playerid']==connection.name){
								prober = resultp;
							}
							else if (resultp['playerid'] == owner){
								probee = resultp;
							}
						 }							 
						 spylevel = prober['tech8'] - probee['tech9'];
						 proberesult = '';
						 if (spylevel >=0){
			                                if (results['sectortype']>5){
                        			                proberesult = "Our probe detected that sector "+sect2update.toString(16)+" is controlled by Player "+owner+" and that the sector contains a colonizable planet with a metal production rate of "+results['metalbonus']+"% and a crystal output rate of "+results['crystalbonus']+"%.";
                                			}
                                			else {
                                			        proberesult = "Our probe detected that sector "+sect2update.toString(16)+" is controlled by Player "+owner+" and that the sector contains no colonizable planets.";
                                			}
						 }
						 totships = results['totalship1']+results['totalship2']+results['totalship3']+results['totalship4']+results['totalship5']+results['totalship6'];
						 if (spylevel == 1){proberesult += "Our spies were able to detect that the enemy has at least "+Math.floor(Math.random()*totships)+" ships in the sector.";}
						 if (spylevel == 2){proberesult += "Our spies were able to detect that the enemy has "+totships+" ships in the sector.";}
						 if (spylevel >= 3){proberesult += "Our spies were able to detect that the enemy has "+totships+" ships in the sector and "+probee['orbitalturret']+" orbital turrets.";}
						 if (spylevel == -1){proberesult = "Our probe was destroyed by Player "+owner+" when attempting to enter sector "+sect2update.toString(16)+".  No other information was gathered.";}
						 if (spylevel == -2){proberesult = "Our probe was destroyed by the enemy when entering sector "+sect2update.toString(16)+".  No information was gathered.";}
						 if (spylevel <= -3){proberesult = "Our probe was destroyed when entering sector "+sect2update.toString(16)+".  No information was gathered.";}
						 connection.sendUTF(proberesult);
						}
					);
		


				}
                    }
                );
}

function moveFleet(message, connection){
	console.log('move fleet requested.');
    if (!connection.sectorid){console.log('not in a sector');}
    else {
	console.log('in a sector. check.');
	var fromHere = connection.sectorid;
        var gotoHere = parseInt(message.utf8Data.split(":")[2],16);
	var s1 = parseInt(message.utf8Data.split(":")[3]);
	var s2 = parseInt(message.utf8Data.split(":")[4]);
	var s3 = parseInt(message.utf8Data.split(":")[5]);
	var s4 = parseInt(message.utf8Data.split(":")[6]);
	var s5 = parseInt(message.utf8Data.split(":")[7]);
	var s6 = parseInt(message.utf8Data.split(":")[8]);

	client.query('SELECT * FROM map'+connection.gameid,
                function (err, resultss, fields) {
                         if (err) {
                                throw err;
                         }	
			console.log('query ok');
			for (var ipp in resultss){
			    results=resultss[ipp];
			    if (results['sectorid']==fromHere && results['ownerid']==connection.name){
				canmove = 0;
				if (results['totalship1']>=s1 && results['totalship2']>=s2 && results['totalship3']>=s3 && results['totalship4']>=s4 && results['totalship5']>=s5 && results['totalship6']>=s6){
						
						console.log('enough ships to move; next check distance req.');
						canmove=0;
                 	               		
						if ((gotoHere-1)%16 > 8 && gotoHere%16 != 0 ){
                        	        	        if (fromHere+1 == gotoHere || fromHere-1 == gotoHere || fromHere+8 == gotoHere || fromHere+9 == gotoHere || fromHere-8 == gotoHere || fromHere-7 == gotoHere){
								canmove = 1;
							}
                        	        	}
                               			else if ((gotoHere-1)%16 < 7 && gotoHere%16 != 1){
                                        		if (fromHere+1 == gotoHere || fromHere-1 == gotoHere || fromHere+8 == gotoHere || fromHere+7 == gotoHere || fromHere-8 == gotoHere || fromHere-9 == gotoHere){
								canmove = 1;
							}
                                		}
                                		else if (gotoHere%16==1){
                                		        if (fromHere-1 == gotoHere || fromHere+8 == gotoHere || fromHere+7 == gotoHere || fromHere-8 == gotoHere || fromHere-9 == gotoHere){
								canmove = 1;
							}
						}
                                		else if (gotoHere%16==0){
                                		        if (fromHere+1 == gotoHere || fromHere+8 == gotoHere || fromHere+9 == gotoHere || fromHere-8 == gotoHere || fromHere-7 == gotoHere){
								canmove = 1;
							}
						}
                                		else if (gotoHere%8==0){
                                		        if (fromHere+1 == gotoHere || fromHere+8 == gotoHere || fromHere-8 == gotoHere){
								canmove = 1;
							}
						}                                }
                                		else {
                                	       		if (fromHere-1 == gotoHere || fromHere+8 == gotoHere || fromHere-8 == gotoHere){
								canmove = 1;
							}
						}
						if (canmove==1){
							console.log('jump can be made in one move: '+gotoHere);


							client.query('SELECT * FROM players'+connection.gameid,
							    	function (err, resultsxx, fields) {
                         						if (err) {
                         					       		throw err;
                     					    		}
									for (var ia in resultsxx){
										resultp=resultsxx[ia];
										if (resultp['playerid'] == connection.name){break;}
									}	
									if ((s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100<=resultp['crystal']){
									  console.log('enough crystal');
									  for (var ii in resultss){
									     resultsx=resultss[ii];
                	                		                     if (resultsx['sectorid']==gotoHere){
									     	console.log('sectorfound');
										if (resultsx['sectortype']==1){
                                                                                        client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
											client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' WHERE playerid = '+connection.name);
											connection.sendUTF('Fleet moved... but the sector contained a blackhole! UH-OH! Cost: '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' Crystal, plus our fleet was crushed by the immense gravity of the black hole!');
											updateAllSectors(connection.gameid,connection);
                                                                                        updateResources(connection);
											connection.sendUTF("info:"+gotoHere.toString(16)+":1");
                                                                                        break;
										}
                                                                                else if (resultsx['sectortype']==2 && resultsx['ownerid']!=connection.name){
											starttravel=s1+s2+s3+s4+s5+s6;
											client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' WHERE playerid = '+connection.name);
											client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
											s1 = Math.round(s1*Math.random());
                                                                                        s2 = Math.round(s2*Math.random());
                                                                                        s3 = Math.round(s3*Math.random());
                                                                                        s4 = Math.round(s4*Math.random());
                                                                                        s5 = Math.round(s5*Math.random());
                                                                                        s6 = Math.round(s6*Math.random());
											endtravel=s1+s2+s3+s4+s5+s6;
                                                                                        connection.sendUTF('Our fleet warped into an asteroid belt and were hit hard. Ouch! We lost '+(starttravel-endtravel)+' ships.  If we can control the sector though, that should not happen to us again.');
											if (endtravel==starttravel){
												updateAllSectors(connection.gameid,connection);
                                                                                        	updateResources(connection);
												connection.sendUTF("info:"+gotoHere.toString(16)+":0");
												break;
											}
											connection.sendUTF("info:"+gotoHere.toString(16)+":0");
                                                                                }
                                	                                	if (resultsx['ownerid']==0){
											client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+s1+', totalship2 = '+s2+', totalship3 = '+s3+', totalship4 = '+s4+', totalship5 = '+s5+', totalship6 = '+s6+', ownerid = '+connection.name+' WHERE sectorid = '+gotoHere);
											if (resultsx['sectortype']!=2){
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
                                		        	                        	console.log('sector untaken. take it');
												client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' WHERE playerid = '+connection.name); 
												connection.sendUTF('Fleet moved; you took control of the sector without issue. cost: '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' Crystal.');
											}
											updateAllSectors(connection.gameid,connection);
											updateResources(connection);
											break;
	                		                                                }
                	                		                        else if (resultsx['ownerid']==connection.name){
        	                                        		                client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 + '+s1+', totalship2 = totalship2 + '+s2+', totalship3 = totalship3 +  '+s3+', totalship4 = totalship4 + '+s4+', totalship5 = totalship5 + '+s5+', totalship6 = totalship6 + '+s6+' WHERE sectorid = '+gotoHere);
											client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
		                	                                                console.log('sector yours. move freely');
											client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' WHERE playerid = '+connection.name);
											connection.sendUTF('Fleet moved sucessfully. Cost: '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' Crystal.');
											updateAllSectors(connection.gameid,connection);
											updateResources(connection);
											break;
                                                        			}
		                                                        	else if (resultsx['ownerid']===undefined){
                		                                                        console.log('ERROR 324!');
     	        	                   		                        }
 		                                               		        else { 

////////////////////////// battle mechanic starts here
											defenderid=resultsx['ownerid'];
									                for (var ib in resultsxx){
                                                                        		       	resultdd=resultsxx[ib];
                                                                                		if (resultdd['playerid'] == defenderid){break;}
                                                                        		}
											console.log('An attack is taking place.');
											if (resultsx['sectortype']!=2){
												client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100+' WHERE playerid = '+connection.name);
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
											}
											ispp=0;
											battle='battle';

/// attackers tech info is in resultp[]
/// defenders tech info is in resultdd[]

AWL = resultp['tech4']; 	 // attacker's weapon tech level (ie: no weapon tech is then 0)
DWL = resultdd['tech4']; 	 //attacker's weapon tech level

DSL = resultdd['tech6'];	//defender's shield's level (ie: 1)
ASL = resultp['tech6']; 	//attack's shield's level
	
a1=[];
a2=[];
a3=[];
a4=[];
a5=[];
a6=[];

for (tmp=0;tmp<s1;tmp++){
	a1[tmp]=Math.pow(1.1,resultp['tech5']);
} 
for (tmp=0;tmp<s2;tmp++){
        a2[tmp]=2*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s3;tmp++){
        a3[tmp]=Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s4;tmp++){
        a4[tmp]=2*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s5;tmp++){
        a5[tmp]=3*Math.pow(1.1,resultp['tech5']);
}
for (tmp=0;tmp<s6;tmp++){
        a6[tmp]=Math.pow(1.1,resultp['tech5']);
}

////////////////////////

d1=[];
d2=[];
d3=[];
d4=[];
d5=[];
d6=[];

d7 = resultsx['groundturret'];
d8 = resultsx['orbitalturret'];

for (tmp=0;tmp<resultsx['totalship1'];tmp++){
        d1[tmp]=Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship2'];tmp++){
        d2[tmp]=2*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship3'];tmp++){
        d3[tmp]=Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship4'];tmp++){
        d4[tmp]=2*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship5'];tmp++){
        d5[tmp]=3*Math.pow(1.1,resultdd['tech5']);
}
for (tmp=0;tmp<resultsx['totalship6'];tmp++){
        d6[tmp]=Math.pow(1.1,resultdd['tech5']);
}


///////////////////////////

											
DOS = d8; // total shots from defender's orbitals this round. no tech bonus. no hitpoints. non-changing since orbitals cant be destroyed.

battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
console.log('battle:'+battle);
var stopvar = 0;
while (stopvar == 0){
	
	///  destroyers and dreadnoughts do multiple hits; not one large chunk of damage.  

	ATS = a1.length + a2.length*2 + a4.length + a5.length*3;   // attackers total shots per round (changes)
	DTS = d1.length + d2.length*2 + d4.length + d5.length*3;   // defenders total shots per round from ships (changes);
	console.log(ATS+":A vs D:"+DTS);
	//////////////////// Attacker's Turn to hit.
	if (ATS>0) {	                                  		// for each enemy shot do the following...
		console.log("ATS>0");
		while (ATS>0 && d1.length>0){           		// See what shots first hit defender's corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,DSL)) ){  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				d1[d1.length-1]-=Math.pow(1.1,AWL);  		// hit a corvette for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			ATS--;                   	 		// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d1[d1.length-1]<=0) {   	 		// check to see if that ship has lost all hitpoints
				d1.splice(d1.length-1,1);  		// if it has, remove that ship from the battle.
			}	
		}		
	
		while (ATS>0 && d2.length>0){		 			// Assuming shots left and defender has destroyers, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d2[d2.length-1]-=Math.pow(1.1,AWL);  			// hit a destroyer for 1 shot (1.1 dmg in this case)
			}	
			ATS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d2[d2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				d2.splice(d2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}		
	
	
		while (ATS>0 && d4.length>0){		 			// Assuming shots left and defender has crusiers, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d4[d4.length-1]-=Math.pow(1.1,AWL);  			// hit a crusier for 1 shot (1.1 dmg in this case)
			}	
			ATS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d4[d4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				d4.splice(d4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}		
	
		while (ATS>0 && d5.length>0){		 				// Assuming shots left and defender has dreadnought, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))*(0.9*Math.pow(0.95,DSL))){  	// if random is less than the chance to hit... hit.  	
											// if the shot accuracy (0 to 1.0) is greater than the double shield mod+base...
				d5[d5.length-1]-=Math.pow(1.1,AWL); 				// hit the dreadnought for 1 shot (1.1 dmg in this case)
					
			}
			ATS--;                   	 				// reduce the number of shots remaining by 1, even if the shot did no damage
			if (d5[d5.length-1]<=0) {   	 				// check to see if that ship has lost all hitpoints
				d5.splice(d5.length-1,1);  				// if it has, remove that ship from the battle.
			}	
		}
			
		while (ATS>0 && d3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			d3[d3.length-1]-=Math.pow(1.1,AWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			ATS--;                   	 	// reduce the number of shots remaining by 1
			if (d3[d3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				d3.splice(d3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		
		while (ATS>0 && d6.length>0){		 	// Assuming shots left and defender has colonyship, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,DSL))){  		// if the shot accuracy (0 to 1.0) is greater than the shield mod+base, hit
				d6[d6.length-1]-=Math.pow(1.1,AWL); 		// hit the colony ship for 1 shot (1.1 dmg in this case)
			}
			ATS--;                   	 	// reduce the number of shots remaining by 1, even if deflected
			if (d6[d6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				d6.splice(d6.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
	
		while (ATS>0 && d7>0){		 	// Assuming shots left and defender has ground turrets (or a colonized planet), do the following...
			d7-=Math.pow(1.1,AWL); 		// hit the planet for 1 shot (1.1 dmg in this case)
			ATS--;                   	// reduce the number of shots remaining by 1
			if (d7<0) {   		 	// check to see if the ground defense has been overrun
				d7=0;		  	// if it has,  Sector is free for the taking if d7=0 and if there are no defending ships still alive.
			}	
		}
	}
	
	////////////////  Defender's turn to hit.
	
	if (DTS+DOS>0) {         						// the defending ships/planet now get to take their shots on the incoming attackers... assuming they have shots to be made.
		console.log("DTS+DOS>0");
		while (DTS>0 && a1.length>0){            			// See what shots hit attackers corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) ) ){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a1[a1.length-1]-=Math.pow(1.1,DWL);  			// hit a corvette for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a1[a1.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a1.splice(a1.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a1.length>0){            			// See what orbital shots hit attacks corvette, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a1[a1.length-1]--;  				// hit a corvette for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a1[a1.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a1.splice(a1.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	       								
		while (DTS>0 && a2.length>0){            			// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a2[a2.length-1]-=Math.pow(1.1,DWL);  			// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a2[a2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a2.splice(a2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a2.length>0){            			// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a2[a2.length-1]--;  				// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a2[a2.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a2.splice(a2.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a4.length>0){            			// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a4[a4.length-1]-=Math.pow(1.1,DWL);  			// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 			// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a4[a4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a4.splice(a4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a4.length>0){            			// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a4[a4.length-1]--;  				// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}	
			DOS--;                   	 			// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a4[a4.length-1]<=0) {   	 			// check to see if that ship has lost all hitpoints
				a4.splice(a4.length-1,1);  			// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a5.length>0){            						// See what shots hit attackers destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL)) * (0.9*Math.pow(0.95,ASL))) {  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a5[a5.length-1]-=Math.pow(1.1,DWL);  					// hit a destroyer for 1 shot, plus attacker's modifier tech damage (1.1 dmg in this case)
			}	
			DTS--;                   	 						// reduce the number of shots remaining by 1, even if the shot did no damage
			if (a5[a5.length-1]<=0) {   	 						// check to see if that ship has lost all hitpoints
				a5.splice(a5.length-1,1);  						// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a5.length>0){            						// See what orbital shots hit attacks destroyer, if any.
			if (Math.random() < (0.9*Math.pow(0.95,ASL))*(0.9*Math.pow(0.95,ASL))) {  	// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a5[a5.length-1]--;  							// hit a destroyer for 1 shot; 1 damage only, since it was from an orbital
			}		
			DOS--;          		         	 				// reduce the number of shots remaining by the orbitals by 1, even if the shot did no damage
			if (a5[a5.length-1]<=0) {   			 				// check to see if that ship has lost all hitpoints
				a5.splice(a5.length-1,1);  						// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			a3[a3.length-1]-=Math.pow(1.1,DWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			DTS--;                   	 	// reduce the number of shots remaining by 1
			if (a3[a3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a3.splice(a3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a3.length>0){		 	// Assuming shots left and defender has scout, do the following...
			a3[a3.length-1]--; 			// hit the scout for 1 shot (1.1 dmg in this case)
			DOS--;                   	 	// reduce the number of shots remaining by 1
			if (a3[a3.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a3.splice(a3.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
	
		while (DTS>0 && a6.length>0){		 	// Assuming shots left and defender has scout, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a6[a6.length-1]-=Math.pow(1.1,DWL); 		// hit the scout for 1 shot (1.1 dmg in this case)
			}
			DTS--;                   	 	// reduce the number of shots remaining by 1
			if (a6[a6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a6.splice(a6.length-1,1);  	// if it has, remove that ship from the battle.
			}	
		}
		while (DOS>0 && a6.length>0){		 	// Assuming shots left and defender has colonyship, do the following...
			if (Math.random() < (0.9*Math.pow(0.95,ASL) )){  		// if the shot accuracy (0 to 1.0) is greater than the shield , hit
				a6[a6.length-1]--; 			// hit the colony ship for 1 shot (1.1 dmg in this case)
			}
			DOS--;                   	 	// reduce the number of shots remaining by 1
			if (a6[a6.length-1]<=0) {   		 // check to see if that ship has lost all hitpoints
				a6.splice(a6.length-1,1);  	// if it has, remove that ship from the battle.
			}
		}		
	
	}
	/////// check to see if anyone won this round of battle
	if ((a1.length + a2.length + a3.length + a4.length + a5.length + a6.length)==0) {   /// if true, all attacking ships are dead. Defender auto-win.
		client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+d1.length+', totalship2 = '+d2.length+', totalship3 = '+d3.length+', totalship4 = '+d4.length+', totalship5 = '+d5.length+', totalship6 = '+d6.length+' WHERE sectorid = '+gotoHere);
		connection.sendUTF('All our ships were destroyed.  We lost the battle.');
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
		connection.sendUTF("info:"+gotoHere.toString(16)+":"+3);
                for (mm in clients){
                        if (clients[mm].gameid==connection.gameid){
                                if (clients[mm].name!=connection.name && defenderid==clients[mm].name){
                                        clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+", yet we won the battle.");
                                        clients[mm].sendUTF(battle);
                                        updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
                                }
                                else if (clients[mm].name!=connection.name){
                                        clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
                                }
                        }
                }

                                                                                                                     updateAllSectors(connection.gameid,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);

		break;	
	}
	else if ((d1.length + d2.length + d3.length + d4.length + d5.length + d6.length + d7)==0) {   /// if true, all defenders are out of hitpoints or sector uncolonized/defended, yet attackers still alive. Sector captured.
		client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+a1.length+', totalship2 = '+a2.length+', totalship3 = '+a3.length+', totalship4 = '+a4.length+', totalship5 = '+a5.length+', totalship6 = '+a6.length+', ownerid = '+connection.name+', colonized = 0, groundturret = 0, orbitalturret = 0, academylvl = 0, shipyardlvl = 0, metallvl = 0, crystallvl = 0, totship1build = 0, totship2build = 0, totship3build = 0, totship4build = 0, totship5build = 0, totship6build = 0 WHERE sectorid = '+gotoHere);
		connection.sendUTF('We captured the sector.');
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
                for (mm in clients){
                        if (clients[mm].gameid==connection.gameid){
                                if (clients[mm].name!=connection.name && defenderid==clients[mm].name){
                                        clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+" and we lost the battle.");
                                        clients[mm].sendUTF(battle);
                                        clients[mm].sendUTF("info:"+gotoHere.toString(16)+":"+3);
                                        updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
                                }
                                else if (clients[mm].name!=connection.name){
                                        clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
                                }
                        }
                }

		                                                                                                     updateAllSectors(connection.gameid,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);
		break;
	}
	else if ((a1.length + a2.length + a4.length + a5.length)==0) {   // if true, attackers have no more firepower, yet defenders are still alive... with something, so defenders auto win.
		client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+d1.length+', totalship2 = '+d2.length+', totalship3 = '+d3.length+', totalship4 = '+d4.length+', totalship5 = '+d5.length+', totalship6 = '+d6.length+' WHERE sectorid = '+gotoHere);
		connection.sendUTF("We tried to retreat from an enemy's sector, but were destroyed."); 
		battle+=":"+a1.length+":"+a2.length+":"+a3.length+":"+a4.length+":"+a5.length+":"+a6.length+":"+d1.length+":"+d2.length+":"+d3.length+":"+d4.length+":"+d5.length+":"+d6.length+":"+d7+":"+d8;
		connection.sendUTF(battle);
		connection.sendUTF("info:"+gotoHere.toString(16)+":"+3);
                for (mm in clients){
                        if (clients[mm].gameid==connection.gameid){
                                if (clients[mm].name!=connection.name && defenderid==clients[mm].name){
                                        clients[mm].sendUTF("We were just attacked in sector "+gotoHere.toString(16)+", yet we won the battle.");
                                        clients[mm].sendUTF(battle);
                                        updateAllSectors(clients[mm].gameid,connection);
                                        updateResources(clients[mm]);
                                        updateSector2(clients[mm].sectorid, clients[mm]);
                                }
                                else if (clients[mm].name!=connection.name){
                                        clients[mm].sendUTF("Somewhere in the universe, a great battle just took place.");
                                }
                        }
                }

                                                                                                                     updateAllSectors(connection.gameid,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);

		break;
	}	
	//otherwise, just keep repeating everything again until there is a winner or loser....
}
///////////////////////////////////////////////////////// END BATTLE MECHANIC
										}
										break;  // sector was found.  either battle or move or sector captured done.  dont waste CPU finishing off array search loop
									    }
									  }
									}
									else {
										connection.sendUTF('You do not have enough crystal to move those ships. Needed: '+(s1*2+s2*3+s3*1+s4*2+s5*3+s6*2)*100);
									}	
								}
							);
							break;	

						}
						else {
							console.log('not one just away..')
						}
					}
					else {
					 	console.log('move failed; not enough ships: '+s1);
					}

				}


				}
				
	);
    }
}
function updateSector(message, connection){
                sect2updatehex = message.utf8Data.split("//sector tile")[1];
                sect2update = parseInt(sect2updatehex,16);
                client.query('SELECT * FROM map'+connection.gameid+' WHERE sectorid = '+sect2update+' LIMIT 1',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
                        console.log("sector update");
                        results=results[0];
			if (results['ownerid']==connection.name){
	                        connection.sendUTF("sector:"+sect2updatehex+":owner:"+results['ownerid']+":type:"+results['sectortype']+":artifact:"+results['artifact']+":metalbonus:"+results['metalbonus']+":crystalbonus:"+results['crystalbonus']+":terraform:"+results['terraformlvl']);
	                        connection.sendUTF("ub:"+results['metallvl']+":"+results['crystallvl']+":"+results['academylvl']+":"+results['shipyardlvl']+":"+results['orbitalturret']+":"+results['groundturret']); 
				connection.sectorid=sect2update;
				cid[connection.name]=connection;
		        	connection.sendUTF("Updated sector "+sect2updatehex+" successfully.");
				connection.sendUTF("fleet:"+results['totalship1']+":"+results['totalship2']+":"+results['totalship3']+":"+results['totalship4']+":"+results['totalship5']+":"+results['totalship6']+":"+results['totship1build']+":"+results['totship2build']+":"+results['totship3build']+":"+results['totship4build']+":"+results['totship5build']+":"+results['totship6build']+":"+results['totship1coming']+":"+results['totship2coming']+":"+results['totship3coming']+":"+results['totship4coming']+":"+results['totship5coming']+":"+results['totship6coming']);
			}
			else {
				connection.sendUTF("probeonly:"+sect2update);
			}
	            }
                );
}
function updateSector2(sectordec, connection){
                if (sectordec!==undefined){
	        sect2updatehex = sectordec.toString(16);
                sect2update = sectordec;
                connection.sectorid=sect2update;
		cid[connection.name]=connection;
                client.query('SELECT * FROM map'+connection.gameid+' WHERE sectorid = '+sect2update+' LIMIT 1',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
                        console.log("sector update2");
                        results=results[0];
			connection.sendUTF("ub:"+results['metallvl']+":"+results['crystallvl']+":"+results['academylvl']+":"+results['shipyardlvl']+":"+results['orbitalturret']+":"+results['groundturret']);
                        connection.sendUTF("sector:"+sect2updatehex+":owner:"+results['ownerid']+":type:"+results['sectortype']+":artifact:"+results['artifact']+":metalbonus:"+results['metalbonus']+":crystalbonus:"+results['crystalbonus']+":terraform:"+results['terraformlvl']);
			connection.sendUTF("fleet:"+results['totalship1']+":"+results['totalship2']+":"+results['totalship3']+":"+results['totalship4']+":"+results['totalship5']+":"+results['totalship6']+":"+results['totship1build']+":"+results['totship2build']+":"+results['totship3build']+":"+results['totship4build']+":"+results['totship5build']+":"+results['totship6build']+":"+results['totship1coming']+":"+results['totship2coming']+":"+results['totship3coming']+":"+results['totship4coming']+":"+results['totship5coming']+":"+results['totship6coming']);
			sectorinfo = results;
                        totalshipinsec = sectorinfo['totalship1']+sectorinfo['totalship2']+sectorinfo['totalship3']+sectorinfo['totalship4']+sectorinfo['totalship5']+sectorinfo['totalship6'];
				if (sectorinfo['sectortype']==2){
					 connection.sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":"+totalshipinsec+":A");
				}	
				else {
                        		connection.sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":"+totalshipinsec+":"+sectorinfo['colonized']);
				}
			}
                );
		}
		else {
			console.log("No sector selected to refresh; is player dead?");
		}
}
function buyShip(message, connection){
                ship2buy = message.utf8Data.split("//buyship:")[1];
                console.log("player is asking to buy ship: "+ship2buy);
		if (connection.sectorid!==undefined){
		    connection.sendUTF('Building a ship in sector: '+connection.sectorid);
                    client.query('SELECT * FROM map'+connection.gameid+' WHERE sectorid = "'+connection.sectorid+'" LIMIT 1',
                       	function (err, results2, fields) {
                           if (err) {
                                console.log("QUERY FAILED33");
                                throw err;
                           }
                           results2=results2[0];
			   buildSpace = results2['totship1build']*3 + results2['totship2build']*5 + results2['totship3build'] + results2['totship4build']*10 + results2['totship5build']*15 + results2['totship6build']*7;
			   buildSpace = results2['shipyardlvl'] - buildSpace;
			   if ((buildSpace>=3 && ship2buy==1) || (buildSpace>=5 && ship2buy==2) || (buildSpace>=1 && ship2buy==3) || (buildSpace>=10 && ship2buy==4) || (buildSpace>=15 && ship2buy==5) || (buildSpace>=7 && ship2buy==6) ){
  			     client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
                                function (err, results, fields) {
                                	if (err) {
                                		console.log("QUERY FAILED22");
                                		 throw err;
                                	}
                                	results=results[0];
                           		if (results2['ownerid']==connection.name){
							if (results['metal']>=200 && ship2buy==1){
								client.query('UPDATE players'+connection.gameid+' SET metal = metal - 200 WHERE playerid = "'+connection.name+'"');
						           	client.query('UPDATE map'+connection.gameid+' SET totship1build = totship1build +1 WHERE sectorid = "'+connection.sectorid+'"' );
								connection.sendUTF('You started construction on a ship in this sector.');
								updateResources(connection);
								
							}
							else if (results['metal']>=500 && ship2buy==2){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 500 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship2build = totship2build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=100 && ship2buy==3){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 100 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship3build = totship3build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=500 && ship2buy==4){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 500 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship4build = totship4build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=1000 && ship2buy==5){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 1000 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship5build = totship5build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=1000 && ship2buy==6){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 1000 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship6build = totship6build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);
                                                        }
							else {
								connection.sendUTF('You do not have enough resources for this purchase.');
							}
							updateAllSectors( connection.gameid, connection);
	   				 }
					 else {
						connection.sendUTF('You do not own this sector. Cannot build ship.');
					 }
			     	   }
			     );
                         }
                         else {
                              connection.sendUTF('Your shipyard does not have enough free space to build this ship. Please upgrade it accordingly.')
                         }
		       }
		    );
		}
		else {connection.sendUTF('You need to specify a sector');}
}
function buyBuilding(message, connection){
                building2buy = message.utf8Data.split("//buybuilding:")[1];
                console.log("player is asking to buy building: "+building2buy);
                if (connection.sectorid!==undefined){
	            client.query('SELECT * FROM map'+connection.gameid+' WHERE sectorid = "'+connection.sectorid+'" LIMIT 1',
                       function (err, results2, fields) {
                           if (err) {
                                console.log("QUERY FAILED33");
                                throw err;
                           }
                           results2=results2[0];    	
 		    	   if (results2['ownerid']==connection.name && results2['terraformlvl']==0 && results2['colonized'] == 1 && results2['sectortype']>5){
	 	   	     client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
	                        function (err, results, fields) {
        	                    if (err) {
                	              console.log("QUERY FAILED22");
                        	      throw err;
                        	    }
				    results=results[0];
					if (building2buy==1){
						if (results['metal']>=100*(results2['metallvl']+1)){
			                	        connection.sendUTF('Building a metal extractor in sector: '+connection.sectorid.toString(16));
	        	                		client.query('UPDATE map'+connection.gameid+' SET metallvl = metallvl +1 WHERE sectorid = "'+connection.sectorid+'"' );
	                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+(100*(results2['metallvl']+1))+' WHERE playerid = "'+connection.name+'"' );
                                                        updateResources(connection);
							updateSector2(connection.sectorid, connection);
						}
						else {
							connection.sendUTF('Not enough Metal');
							console.log('not enough metal');
						}
	                		}
					else if (building2buy==2){
                                                if (results['metal']>=100*(results2['crystallvl']+1)){
                                                        connection.sendUTF('Building a crystal refinery in sector: '+connection.sectorid.toString(16));
                                                        client.query('UPDATE map'+connection.gameid+' SET crystallvl = crystallvl +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                        client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+(100*(results2['crystallvl']+1))+' WHERE playerid = "'+connection.name+'"' );
                                                        updateResources(connection);                                                
                                                        updateSector2(connection.sectorid, connection);
						}
                                                else {
                                                        connection.sendUTF('Not enough Metal');
                                                        console.log('not enough metal');
                                                }
	                       	 	}
	                       		else if (building2buy==3){
                                                if (results['metal']>=100*(results2['academylvl']+1)){
        	                                        connection.sendUTF('Building a research academy in sector: '+connection.sectorid.toString(16));
	                                                client.query('UPDATE map'+connection.gameid+' SET academylvl = academylvl +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                        client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+(100*(results2['academylvl']+1))+' WHERE playerid = "'+connection.name+'"' );
                                                        updateResources(connection);
                                                        updateSector2(connection.sectorid, connection);
						}
                                                else {
                                                        connection.sendUTF('Not enough Metal');
                                                        console.log('not enough metal');
                                                }
   	    	                 	}
   	    	                 	else if (building2buy==4){
						if (results['metal']>=100*(results2['shipyardlvl']+1)){
                                                        connection.sendUTF('Building a research spaceport in sector: '+connection.sectorid.toString(16));
                                                        client.query('UPDATE map'+connection.gameid+' SET shipyardlvl = shipyardlvl +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                        client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+(100*(results2['shipyardlvl']+1))+' WHERE playerid = "'+connection.name+'"' );
                                                        updateResources(connection);
                                                        updateSector2(connection.sectorid, connection);
                                                }
                                                else {
                                                        connection.sendUTF('Not enough Metal');
                                                        console.log('not enough metal');
						}
   		                     	}
   		                     	else if (building2buy==5){
                                                if (results['metal']>=100*(results2['orbitalturret']+1)){
                                                        connection.sendUTF('Building a orbital defence platform in sector: '+connection.sectorid.toString(16));
                                                        client.query('UPDATE map'+connection.gameid+' SET orbitalturret = orbitalturret +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                        client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+ (100*(results2['orbitalturret']+1))+' WHERE playerid = "'+connection.name+'"' );
                                                        updateResources(connection);
                                                        updateSector2(connection.sectorid, connection);
						}
                                                else {
                                                        connection.sendUTF('Not enough Metal');
                                                        console.log('not enough metal');
                                                }
               	         		}
                	        	else if (building2buy==6){
						if (results['metal']>=100*(results2['groundturret']+1)){
                                                        connection.sendUTF('Building a ground defence grid in sector: '+connection.sectorid.toString(16));
                                                        client.query('UPDATE map'+connection.gameid+' SET groundturret = groundturret +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                        client.query('UPDATE players'+connection.gameid+' SET metal = metal - '+(100*(results2['groundturret']+1))+' WHERE playerid = "'+connection.name+'"' );
							updateResources(connection);
                                                        updateSector2(connection.sectorid, connection);
                                                }
                                                else {
                                                        connection.sendUTF('Not enough Metal');
                                                        console.log('not enough metal');
						}
                	        	}
					else {
                	        	        connection.sendUTF('That build option does not exist: error');
						console.log("trying to buy a building that does not exist");
					}
			          }
			     );
			   }
			   else if (results2['colonized']!=1){
				connection.sendUTF('You first need to colonize this sector before you can build on it');
			   }
			   else if (results2['sectortype']<=5){
				connection.sendUTF('This sector contains no planets; building and terraforming not possible');
			   }
			   else if (results2['terraformlvl']!=0){
				 connection.sendUTF('This sector needs terraforming before you can build on it.');
			   } 
			   else {
				connection.sendUTF('You need to own this sector first');
				console.log(results2['ownerid']+":"+connection.name+":GAMEID:"+connection.gameid);
			   }
			}
		    );
		}
                else {connection.sendUTF('You need to specify a sector');}
}
function buyTech(message, connection){
                tech2buy = message.utf8Data.split("//buytech:")[1];
		type2buy = parseInt(tech2buy) ;
                console.log("player is asking to buy tech: "+tech2buy);
                client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
			results=results[0];
				if (results['tech'+type2buy]!=undefined  && Math.pow(8,results['tech'+type2buy]+1) <= results['research'] && type2buy==7){
                                                client.query('UPDATE players'+connection.gameid+' SET research = "'+ (results['research'] -  Math.pow(8,results['tech'+type2buy]+1)) +'", tech'+type2buy+' = tech'+type2buy+' + 1 WHERE  playerid = "'+connection.name+'"');
                                                updateResources(connection);
                                                connection.sendUTF("Tech purchased.");
                                                results['tech'+type2buy]++;			
				}
		 		else if (results['tech'+type2buy]!=undefined  && Math.pow(4,results['tech'+type2buy]+1) <= results['research']){
						client.query('UPDATE players'+connection.gameid+' SET research = "'+ (results['research'] -  Math.pow(4,results['tech'+type2buy]+1)) +'", tech'+type2buy+' = tech'+type2buy+' + 1 WHERE  playerid = "'+connection.name+'"');
						updateResources(connection);
						connection.sendUTF("Tech purchased.");
						results['tech'+type2buy]++;
				}
				else {
					connection.sendUTF("You do not have enough research to get this tech. Needed: "+ Math.pow(10,results['tech'+type2buy]+1) );
				}
				connection.sendUTF("tech:"+results['tech1']+":"+results['tech2']+":"+results['tech3']+":"+results['tech4']+":"+results['tech5']+":"+results['tech6']+":"+results['tech7']+":"+results['tech8']+":"+results['tech9']);
				
		    }

                );
}

function authUser(message,connection){
	var pid = message.utf8Data.split(":")[1];
	var tkey = message.utf8Data.split(":")[2];
	console.log("player "+pid+" is trying to connect.");
	client.query('SELECT * FROM users where id = '+pid+' LIMIT 1',
                function (err, results, fields) {
                         if (err) {
                                throw err;
                         }
			 var result = results[0];
			 if (result['tempkey']==tkey && result['currentgame'] && tkey){

				connection.name=pid;
                                connection.gameid=result['currentgame'];
				cid[pid]=connection;
				console.log(pid+":"+cid[pid])
				clients.splice(clients.indexOf(connection),1);
				clients.push(connection);

				if (turns[connection.gameid]>0){
					connection.sendUTF("You have re-connected to a game that is already in progress.");
					updateResources(connection);
        	                 	updateAllSectors( connection.gameid, connection);
				}
				else {
					connection.sendUTF("lobby::");
					connection.sendUTF("The game has yet to begin. Welcome.");
				}		
				console.log ("player "+pid+" was authed. Joining game "+result['currentgame']);
				
				var playerlist="pl";
        			for (var i in clients){
                	        	clients[i].sendUTF("$^$"+clients.length);
                        		if (clients[i].gameid==connection.gameid){
						if ( connection.name!=clients[i].name || connection==clients[i] ){
                               				playerlist=playerlist+":"+clients[i].name;
						}
        	                	}
	       			}
        			for (var i in clients){
                			if (clients[i].gameid==connection.gameid && playerlist!="pl"){
                        			clients[i].sendUTF(playerlist);
		        		}
				}			
                         }
			 else if (!result['currentgame']){
				connection.sendUTF("Please join a game first.");
				console.log ("no game set in sql for player. fail");
				connection.close();
			 }
			 else {
				connection.sendUTF("Error With Connection Credentials. Welcome to limbo annoymous.");
                                console.log ("wrong credentials. fail");				
				connection.close();
			 }
		} 
        );
}

function updateAllSectors(gameID,connection){
	 client.query('SELECT * FROM map'+gameID,
                                function (err, mapResults, fields) {
                                        if (err) {
                                                throw err;
                                        }
					var totshipinsec;
                                        for (var i in mapResults){
		                          	sectorinfo = mapResults[i];
                				if ( sectorinfo['ownerid']==connection.name){
                                                       	if (connection.sectorid==undefined){
                                                                connection.sectorid=sectorinfo['sectorid'];
								connection.sendUTF("sector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":owner:"+sectorinfo['ownerid']+":type:"+sectorinfo['sectortype']+":artifact:"+sectorinfo['artifact']+":metalbonus:"+sectorinfo['metalbonus']+":crystalbonus:"+sectorinfo['crystalbonus']+":terraform:"+sectorinfo['terraformlvl']);
								cid[connection.name]=connection;
								connection.sendUTF("ub:"+sectorinfo['metallvl']+":"+sectorinfo['crystallvl']+":"+sectorinfo['academylvl']+":"+sectorinfo['shipyardlvl']+":"+sectorinfo['orbitalturret']+":"+sectorinfo['groundturret']);
								connection.sendUTF("fleet:"+sectorinfo['totalship1']+":"+sectorinfo['totalship2']+":"+sectorinfo['totalship3']+":"+sectorinfo['totalship4']+":"+sectorinfo['totalship5']+":"+sectorinfo['totalship6']+":"+sectorinfo['totship1build']+":"+sectorinfo['totship2build']+":"+sectorinfo['totship3build']+":"+sectorinfo['totship4build']+":"+sectorinfo['totship5build']+":"+sectorinfo['totship6build']+":"+sectorinfo['totship1coming']+":"+sectorinfo['totship2coming']+":"+sectorinfo['totship3coming']+":"+sectorinfo['totship4coming']+":"+sectorinfo['totship5coming']+":"+sectorinfo['totship6coming']);
							}
							else if (connection.sectorid==sectorinfo['sectorid']){
								connection.sendUTF("sector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":owner:"+sectorinfo['ownerid']+":type:"+sectorinfo['sectortype']+":artifact:"+sectorinfo['artifact']+":metalbonus:"+sectorinfo['metalbonus']+":crystalbonus:"+sectorinfo['crystalbonus']+":terraform:"+sectorinfo['terraformlvl']);								
								connection.sendUTF("ub:"+sectorinfo['metallvl']+":"+sectorinfo['crystallvl']+":"+sectorinfo['academylvl']+":"+sectorinfo['shipyardlvl']+":"+sectorinfo['orbitalturret']+":"+sectorinfo['groundturret'])
								connection.sendUTF("fleet:"+sectorinfo['totalship1']+":"+sectorinfo['totalship2']+":"+sectorinfo['totalship3']+":"+sectorinfo['totalship4']+":"+sectorinfo['totalship5']+":"+sectorinfo['totalship6']+":"+sectorinfo['totship1build']+":"+sectorinfo['totship2build']+":"+sectorinfo['totship3build']+":"+sectorinfo['totship4build']+":"+sectorinfo['totship5build']+":"+sectorinfo['totship6build']+":"+sectorinfo['totship1coming']+":"+sectorinfo['totship2coming']+":"+sectorinfo['totship3coming']+":"+sectorinfo['totship4coming']+":"+sectorinfo['totship5coming']+":"+sectorinfo['totship6coming'])
							}
							totalshipinsec = sectorinfo['totalship1']+sectorinfo['totalship2']+sectorinfo['totalship3']+sectorinfo['totalship4']+sectorinfo['totalship5']+sectorinfo['totalship6'];
                                                        if (sectorinfo['sectortype']!=2){
								connection.sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":"+totalshipinsec+":"+sectorinfo['colonized']);
							}
							else {
								connection.sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":"+totalshipinsec+":A");
							}
							console.log("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":"+totalshipinsec+":"+sectorinfo['colonized']);
		                               	}
							


                                	}
				}
                    );

}

function startGame(gameID){
	client.query('UPDATE games SET turn = 1 WHERE id = "'+gameID+'"');
	turns[gameID]=1;
	console.log("startGame function started for gameID "+gameID);
                    client.query('SELECT * FROM map'+gameID,
                                function (err, mapResults, fields) {
                                        if (err) {
                                                throw err;
                                        }
					for (var i in mapResults){
						sectorinfo = mapResults[i];
						if (sectorinfo['sectortype']==10 && cid[sectorinfo['ownerid']]!==undefined){
							cid[sectorinfo['ownerid']].sendUTF("sector:"+sectorinfo['sectorid'].toString(16).toUpperCase()+":owner:"+sectorinfo['ownerid']+":type:"+sectorinfo['sectortype']+":artifact:"+sectorinfo['artifact']+":metalbonus:"+sectorinfo['metalbonus']+":crystalbonus:"+sectorinfo['crystalbonus']+":terraform:"+sectorinfo['terraformlvl']);
							cid[sectorinfo['ownerid']].sectorid=sectorinfo['sectorid'];
							cid[sectorinfo['ownerid']].sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase());
							console.log ("player given sector:"+sectorinfo['sectorid'].toString(16));
							updateSector2(sectorinfo['sectorid'], cid[sectorinfo['ownerid']]);
						}
						else { console.log('home with no sector: '+cid[sectorinfo['ownerid']]);}
					}
				}
		    );
                    for (var i in clients){
                           if (clients[i].gameid==gameID){
                                clients[i].sendUTF("GAME HAS STARTED!");
                                clients[i].sendUTF("newround:");
				updateResources(clients[i]);
                           }
                    }
        gameTimer[gameID]=setInterval(function() {nextTurn(gameID);},180000);
}
function nextTurn(gameID){
		    turns[gameID]=turns[gameID]+1;
		    client.query('UPDATE games SET turn = turn + 1 WHERE id = "'+gameID+'"');
		    gameMechanics(gameID);
                    for (var i in clients){
                           if (clients[i].gameid==gameID){
				clients[i].sendUTF("newround:");
                           }
                    }
}
function gameMechanics(gameID){
        client.query('SELECT * FROM players'+gameID,
                function (err, playerResults, fields) {
                         if (err) {
                                throw err;
                         }
 		         client.query('SELECT * FROM map'+gameID,
		                function (err, mapResults, fields) {
                         		if (err) {
                                		throw err;
                         		}
					var playerMetalMade = [];
                                        var playerCrystalMade = [];
                                        var playerResearchMade = [];
				 	for (var i in mapResults){
						sector = mapResults[i];
						if (sector['ownerid']!=0){
							if (!playerMetalMade[sector['ownerid']]){playerMetalMade[sector['ownerid']]=0}
							if (!playerCrystalMade[sector['ownerid']]){playerCrystalMade[sector['ownerid']]=0}
                                                        if (!playerResearchMade[sector['ownerid']]){playerResearchMade[sector['ownerid']]=0}

							playerMetalMade[sector['ownerid']]=playerMetalMade[sector['ownerid']] + sector['metalbonus']/100*(sector['metallvl']*100);
							console.log("metal made:"+playerMetalMade[sector['ownerid']]); 
                                                        playerCrystalMade[sector['ownerid']]=playerCrystalMade[sector['ownerid']] + sector['crystalbonus']/100*(sector['crystallvl']*100);
                                                        console.log("Crystal made:"+playerCrystalMade[sector['ownerid']]);
                                                        playerResearchMade[sector['ownerid']]=playerResearchMade[sector['ownerid']] + (sector['academylvl']*100);
                                                        console.log("research made:"+playerResearchMade[sector['ownerid']]);

							client.query('UPDATE map'+gameID+' SET totalship1 = totalship1 + '+sector['totship1build']+', totalship2 = totalship2 + '+sector['totship2build']+',totalship3 = totalship3 + '+sector['totship3build']+',totalship4 = totalship4 + '+sector['totship4build']+',totalship5 = totalship5 + '+sector['totship5build']+',totalship6 = totalship6 + '+sector['totship6build']+', totship1build = 0, totship2build = 0, totship3build = 0, totship4build = 0, totship5build = 0, totship6build = 0 WHERE sectorid = '+sector['sectorid']);
						}
					}
					for (var i in playerResults){
						player=playerResults[i];
						playerid=player['playerid'];
                                                if (cid[playerid]!=undefined){
                                                        cid[playerid].sendUTF("Next Round: Emperor, a resource shipment of "+playerMetalMade[playerid]+" metal and "+playerCrystalMade[playerid]+" crystal has just arrived. We have also recieved word that "+playerResearchMade[playerid]+" additional researchers are now on standby."); 
                                                }
						if (playerMetalMade[playerid]!==undefined){
							playerMetalMade[playerid]=playerMetalMade[playerid]+player['metal'];
						}
						else {
							playerMetalMade[playerid]=player['metal'];
						}

                                                if (playerCrystalMade[playerid]!==undefined){
                                                        playerCrystalMade[playerid]=playerCrystalMade[playerid]+player['crystal'];
                                                }
                                                else {
                                                        playerCrystalMade[playerid]=player['crystal'];
                                                }

                                                if (playerResearchMade[playerid]!==undefined){
                                                        playerResearchMade[playerid]=playerResearchMade[playerid]+player['research'];
                                                }
                                                else {
                                                        playerResearchMade[playerid]=player['research'];
                                                }
						client.query('UPDATE players'+gameID+' SET metal="'+playerMetalMade[playerid]+'", crystal="'+playerCrystalMade[playerid]+'", research="'+playerResearchMade[playerid]+'" WHERE playerid = "'+playerid+'"', updateResourcesAll(playerid, playerMetalMade, playerCrystalMade, playerResearchMade));
					}
    				}
			 );
                }
        );
}

function updateResourcesAll(playerid, playerMetalMade, playerCrystalMade, playerResearchMade){
	if (cid[playerid]!==undefined){
		console.log('UpdateResourceALL CALLed');
		cid[playerid].sendUTF('resources:'+playerMetalMade[playerid]+':'+playerCrystalMade[playerid]+':'+playerResearchMade[playerid] );
		updateSector2(cid[playerid].sectorid, cid[playerid]);
		updateAllSectors(cid[playerid].gameid, cid[playerid]);
	}
}
