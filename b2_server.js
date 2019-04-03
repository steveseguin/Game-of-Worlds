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
techtree=[];
loadTechTree();

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
                moveFleet(message,connection);
	    }
	    else if (message.utf8Data.indexOf("//sector tile")===0){
		updateSector(message,connection);
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

function updateResources(connection){
        client.query('SELECT * FROM players'+connection.gameid+' where playerid = "'+connection.name+'" LIMIT 1',
                function (err, results, fields) {
                         if (err) {
                              	throw err;
                         }
                         var result = results[0];
                         connection.sendUTF('resources:'+result['metal']+':'+result['crystal']+':'+result['research']);
                }
        );

}
function loadTechTree(){
                client.query('SELECT * FROM techtree',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
                         console.log("Tech Tree Loaded.");
			 techtree = results;
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
				connection.sendUTF('Sending probe..');
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
                                connection.sendUTF("sector:"+sect2update.toString(16)+":owner:"+results['ownerid']+":type:"+results['sectortype']+":artifact:"+results['artifact']+":metalbonus:"+results['metalbonus']+":crystalbonus:"+results['crystalbonus']+":terraform:"+results['terraformlvl']);
                                connection.sendUTF("ub:"+results['metallvl']+":"+results['crystallvl']+":"+results['academylvl']+":"+results['shipyardlvl']+":"+results['orbitalturret']+":"+results['groundturret']);
                                connection.sectorid=sect2update;
				cid[connection.name]=connection;
                                connection.sendUTF("Probed sector "+sect2update.toString(16)+" successfully.");
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
			for (var i in resultss){
				results=resultss[i];
				if (results['sectorid']==fromHere && results['ownerid']==connection.name){
					if (results['totalship1']>=s1 && results['totalship2']>=s2 && results['totalship3']>=s3 && results['totalship4']>=s4 && results['totalship5']>=s5 && results['totalship6']>=s6){
						console.log('enough ships to move; next check distance req.');
						if (((fromHere%8>=gotoHere%8-1) || (fromHere%8+8==gotoHere%8+1)) && (fromHere%8<=gotoHere%8+1 || fromHere%8+1==gotoHere%8+8 ||  fromHere%8+1==gotoHere%8+9) && (fromHere-gotoHere<=8) && (gotoHere-fromHere<=9)){
							console.log('jump can be made in one move: '+gotoHere);
							client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid='+connection.name+' LIMIT 1',
							    	function (err, resultsxx, fields) {
                         						if (err) {
                         					       		throw err;
                     					    		}	
									resultp=resultsxx[0];								
									if ((s1+s2*2+s3*2+s4+s5*2+s6*3)*100<=resultp['crystal']){
										console.log('enough crystal');
										for (var ii in resultss){
										    resultsx=resultss[ii];
                	                		                            if (resultsx['sectorid']==gotoHere){
											console.log('sectorfound');
                                	                                		if (resultsx['ownerid']==0){
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+s1+', totalship2 = '+s2+', totalship3 = '+s3+', totalship4 = '+s4+', totalship5 = '+s5+', totalship6 = '+s6+', ownerid = '+connection.name+' WHERE sectorid = '+gotoHere);
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
                                		        	                                console.log('sector untaken. take it');
												client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100+' WHERE playerid = '+connection.name); 
												connection.sendUTF('Fleet moved; you took control of the sector without issue. cost: '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100+' Crystal.');
												updateAllSectors(connection.gameid,connection);
												updateResources(connection);
												break;
	                		                                                }
                	                		                                else if (resultsx['ownerid']==connection.name){
        	                                        		                        client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 + '+s1+', totalship2 = totalship2 + '+s2+', totalship3 = totalship3 +  '+s3+', totalship4 = totalship4 + '+s4+', totalship5 = totalship5 + '+s5+', totalship6 = totalship6 + '+s6+' WHERE sectorid = '+gotoHere);
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
		                	                                                        console.log('sector yours. move freely');
												client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100+' WHERE playerid = '+connection.name);
												connection.sendUTF('Fleet moved sucessfully. Cost: '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100+' Crystal.');
												updateAllSectors(connection.gameid,connection);
												updateResources(connection);
												break;
                                                        			        }
		                                                        	        else if (resultsx['ownerid']===undefined){
                		                                                	        console.log('ERROR 324!');
     	        	                   		                                }
 		                                               		                else { 
												defenderid=resultsx['ownerid'];
												console.log('An attack is taking place.');
												client.query('UPDATE players'+connection.gameid+' SET crystal = crystal - '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100+' WHERE playerid = '+connection.name);
												client.query('UPDATE map'+connection.gameid+' SET totalship1 = totalship1 - '+s1+', totalship2 = totalship2 - '+s2+', totalship3 = totalship3 -  '+s3+', totalship4 = totalship4 - '+s4+', totalship5 = totalship5 - '+s5+', totalship6 = totalship6 - '+s6+' WHERE sectorid = '+fromHere);
												offabsorb = s1 + s2*2 + s3 +s4*2 + s5*3;
												defabsorb = resultsx['totalship1'] + resultsx['totalship2']*2 + resultsx['totalship3'] + resultsx['totalship4']*2 + resultsx['totalship5']*3;
												i=0;
												battle='';
												while (i==0){
													battle+=":"+s1+":"+s2+":"+s3+":"+s4+":"+s5+":"+s6+":"+resultsx['totalship1']+":"+resultsx['totalship2']+":"+resultsx['totalship3']+":"+resultsx['totalship4']+":"+resultsx['totalship5']+":"+resultsx['totalship6']+":"+resultsx['groundturret']+":"+resultsx['orbitalturret'];
									                        	defattack = resultsx['totalship1'] + resultsx['totalship2'] + resultsx['totalship4']*2 + resultsx['totalship5']*3 + resultsx['groundturret'] + resultsx['orbitalturret'];
                                                                                                	offattack = s1 + s2 + s4*2 + s5*3;
													if (defattack == 0 && offattack == 0){
														client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+resultsx['totalship1']+', totalship2 = '+resultsx['totalship2']+', totalship3 = '+resultsx['totalship3']+', totalship4 = '+resultsx['totalship4']+', totalship5 = '+resultsx['totalship5']+', totalship6 = '+resultsx['totalship6']+' WHERE sectorid = '+gotoHere);
														connection.sendUTF("STALEMATE; battle and ships lost.");
														connection.sendUTF("battle"+battle);
														if (cid[defenderid]!=undefined){
															cid[defenderid].sendUTF("WE WERE JUST ATTACKED YET WE WERE ABLE TO BARELY HOLD ON");
															updateAllSectors(cid[defenderid].gameid,cid[defenderid]);
                                                                                                                        updateSector2(cid[defenderid].sectorid, cid[defenderid]);
                                                                                                                }
                                                                                                                                                updateAllSectors(connection.gameid,connection);
                                                                                                                                                updateResources(connection);
                                                                                                                                                updateSector2(connection.sectorid, connection);
														break;
													}
													offabsorb = offabsorb - defattack;
													if (offabsorb<0){
                                                                                                                s1+=offabsorb;
                                                                                                                offabsorb=0;
                                                                                                                if (s1<0){
                                                                                                                        s2+=s1;
                                                                                                                        s1=0;
                                                                                                                        if (s2<0){
                                                                                                                                s4+=s2;
                                                                                                                                s2=0;
                                                                                                                                if (s4<0){
                                                                                                                                        s5+=s4;
                                                                                                                                        s4=0;
                                                                                                                                        if (s5<=0){
																		s5=0;
																		i=1;
		                                                                                                                        }
                                                                                                                                }
                                                                                                                        }
                                                                                                                }
                                                                                                        }
                                                                                                        defabsorb = defabsorb - offattack;
													console.log("BATTLE STILL IN PROGRESS");
                                                                                                        if (defabsorb<0){
                                                                                                                resultsx['totalship1']+=defabsorb;
                                                                                                                defabsorb=0;
                                                                                                                if (resultsx['totalship1']<0){
                                                                                                                        resultsx['totalship2']+=resultsx['totalship1'];
                                                                                                                        resultsx['totalship1']=0;
                                                                                                                        if (resultsx['totalship2']<0){
                                                                                                                                resultsx['totalship4']+=resultsx['totalship2'];
                                                                                                                                resultsx['totalship2']=0;
                                                                                                                                if (resultsx['totalship4']<0){
                                                                                                                                        resultsx['totalship5']+=resultsx['totalship4'];
                                                                                                                                        resultsx['totalship4']=0;
                                                                                                                                        if (resultsx['totalship5']<=0){
																		 resultsx['totalship5']=0;
                                                                                                                                                if (i==1){
																			client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+resultsx['totalship1']+', totalship2 = '+resultsx['totalship2']+', totalship3 = '+resultsx['totalship3']+', totalship4 = '+resultsx['totalship4']+', totalship5 = '+resultsx['totalship5']+' WHERE sectorid = '+gotoHere);
                                                                                                                                                        console.log("BOTH SIDES LOST THEIR SHIPS; defender wins");
																			if (cid[defenderid]!=undefined){

                                                                                                                                                                        cid[defenderid].sendUTF("WE WERE JUST ATTACKED YET BARELY HELD ON");
                                                                                                                                                           }
																			connection.sendUTF("WE LOST THE BATTLE!");
                                                                                                                                                }
                                                                                                                                                else {
                                                                                                                                                        i=2;
																		           if (cid[defenderid]!=undefined){
                                                                                                                                                		        cid[defenderid].sendUTF("WE WERE JUST ATTACKED AND LOST CONTROL OF A SECTOR");
		                                                                                                                                           }

																			client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+s1+', totalship2 = '+s2+', totalship3 = '+s3+', totalship4 = '+s4+', totalship5 = '+s5+', totalship6 = '+s6+', ownerid = '+connection.name+', groundturret = 0, orbitalturret = 0, academylvl = 0, shipyardlvl = 0, metallvl = 0, crystallvl = 0, totship1build = 0, totship2build = 0, totship3build = 0, totship4build = 0, totship5build = 0, totship6build = 0 WHERE sectorid = '+gotoHere);
                                                                                                                                                        connection.sendUTF("WE WON THE BATTLE!");
                                                                                                                                                }
	                                                                                                                                                if (cid[defenderid]!=undefined){
			                                                                                                                                        updateAllSectors(cid[defenderid].gameid,cid[defenderid]);
					 															updateSector2(cid[defenderid].sectorid, cid[defenderid]);
																			}	
															                        updateAllSectors(connection.gameid,connection);
                                                                                                						updateResources(connection);
																		updateSector2(connection.sectorid, connection);
																		battle+=":"+s1+":"+s2+":"+s3+":"+s4+":"+s5+":"+s6+":"+resultsx['totalship1']+":"+resultsx['totalship2']+":"+resultsx['totalship3']+":"+resultsx['totalship4']+":"+resultsx['totalship5']+":"+resultsx['totalship6']+":"+resultsx['groundturret']+":"+resultsx['orbitalturret'];
																		connection.sendUTF("battle"+battle);
                                                                                                                                                break;
                                                                                                                                        }
                                                                                                                                }
                                                                                                                        }
                                                                                                                }
                                                                                                        }
													if (i==1){
                        					                                                client.query('UPDATE map'+connection.gameid+' SET totalship1 = '+resultsx['totalship1']+', totalship2 = '+resultsx['totalship2']+', totalship3 = '+resultsx['totalship3']+', totalship4 = '+resultsx['totalship4']+', totalship5 = '+resultsx['totalship5']+' WHERE sectorid = '+gotoHere); 
                                                                                                                connection.sendUTF("WE LOST.");
                                                                                                                if (cid[defenderid]!=undefined){
                                                                                                                        cid[defenderid].sendUTF("WE WERE JUST ATTACKED YET WE WERE ABLE TO BARELY HOLD ON");
                                                                                                                        updateAllSectors(cid[defenderid].gameid,cid[defenderid]);
                                                                                                                        updateSector2(cid[defenderid].sectorid, cid[defenderid]);
                                                                                                                }
                                                                                                                     updateAllSectors(connection.gameid,connection);
                                                                                                                     updateResources(connection);
                                                                                                                     updateSector2(connection.sectorid, connection);
														     battle+=":"+s1+":"+s2+":"+s3+":"+s4+":"+s5+":"+s6+":"+resultsx['totalship1']+":"+resultsx['totalship2']+":"+resultsx['totalship3']+":"+resultsx['totalship4']+":"+resultsx['totalship5']+":"+resultsx['totalship6']+":"+resultsx['groundturret']+":"+resultsx['orbitalturret'];
														     connection.sendUTF("battle"+battle);
													}
												}
											}
        		        	                                 	    }   	        	                
										}
									}
									else {
										connection.sendUTF('You do not have enough crystal to move those ships. Needed: '+(s1+s2*2+s3*2+s4+s5*2+s6*3)*100);
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
				else if (results['sectorid']==fromHere){
					console.log('someone is trying to cheat?; illegal movement');
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
				connection.sendUTF("Sorry, you do not own that sector. Please use a probe instead.");
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
			   client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
                                function (err, results, fields) {
                                	if (err) {
                                		console.log("QUERY FAILED22");
                                		 throw err;
                                	}
                                	results=results[0];
                           		if (results2['ownerid']==connection.name){
						if (results2['shipyardlvl']>=ship2buy){
							if (results['metal']>=100 && ship2buy==1){
								client.query('UPDATE players'+connection.gameid+' SET metal = metal - 100 WHERE playerid = "'+connection.name+'"');
						           	client.query('UPDATE map'+connection.gameid+' SET totship1build = totship1build +1 WHERE sectorid = "'+connection.sectorid+'"' );
								connection.sendUTF('You started construction on a ship in this sector.');
								updateResources(connection);
								
							}
							else if (results['metal']>=200 && ship2buy==2){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 200 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship2build = totship2build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=200 && ship2buy==3){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 200 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship3build = totship3build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=200 && ship2buy==4){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 200 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship4build = totship4build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=400 && ship2buy==5){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 400 WHERE playerid = "'+connection.name+'"');
                                                                client.query('UPDATE map'+connection.gameid+' SET totship5build = totship5build +1 WHERE sectorid = "'+connection.sectorid+'"' );
                                                                connection.sendUTF('You started construction on a ship in this sector.');
                                                                updateResources(connection);

                                                        }
                                                        else if (results['metal']>=1200 && ship2buy==6){
                                                                client.query('UPDATE players'+connection.gameid+' SET metal = metal - 1200 WHERE playerid = "'+connection.name+'"');
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
							 connection.sendUTF('Your shipyard does not meet the requirement. Please upgrade it accordingly.')
						}
	   				 }
					 else {
						connection.sendUTF('You do not own this sector. Cannot build ship.');
					 }
				}
			   );
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
 		    	   if (results2['ownerid']==connection.name){
	 	   	     client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
	                        function (err, results, fields) {
        	                    if (err) {
                	              console.log("QUERY FAILED22");
                        	      throw err;
                        	    }
				    results=results[0];
					if (building2buy==1){
						if (results['metal']>=100*(results2['metallvl']+1)){
			                	        connection.sendUTF('Building a metal extractor in sector: '+connection.sectorid);
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
                                                        connection.sendUTF('Building a crystal refinery in sector: '+connection.sectorid);
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
        	                                        connection.sendUTF('Building a research academy in sector: '+connection.sectorid);
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
                                                        connection.sendUTF('Building a research spaceport in sector: '+connection.sectorid);
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
                                                        connection.sendUTF('Building a orbital defence platform in sector: '+connection.sectorid);
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
                                                        connection.sendUTF('Building a ground defence grid in sector: '+connection.sectorid);
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
                console.log("player is asking to buy tech: "+tech2buy);
                client.query('SELECT * FROM players'+connection.gameid+' WHERE playerid = "'+connection.name+'" LIMIT 1',
                    function (err, results, fields) {
                         if (err) {
                              console.log("QUERY FAILED");
                              throw err;
                         }
			techslower =0;
			techssame=0;
			results=results[0];
			for (var i in techtree){
				techbit=techtree[i];
		 		if (results['tech'+tech2buy]==0  && techbit['techid']==tech2buy && techbit['metal']<=results['metal'] && techbit['crystal']<=results['crystal'] && techbit['research']<=results['research']){
					console.log("TECHID: "+ techbit['techid']);
					for (var t in results){
						ttt=results[t].toString();
						if (ttt.indexOf('tech')==1 && ttt==1){
							checktech = techtree[ttt.split('tech')[1]];
							if (checktech['techlevel']-1==techbit['techlevel']){
								techslower=techslower+1;
							}
							else if (checktech['techlevel']==techbit['techlevel']){
								techssame=techssame+1;
							}
						}
					}
					console.log("techsame: "+techssame+", techlower: "+techslower+", techlvl: "+techbit['techlevel']);
					if (techssame<techslower || techbit['techlevel']==1){
              					connection.sendUTF("Tech Purchased.");
						connection.sendUTF("tech:"+tech2buy);
						client.query('UPDATE players'+connection.gameid+' SET metal = "'+ (results['metal']-techbit['metal'])+'",  crystal = "'+ (results['crystal']-techbit['crystal'])+'",  research = "'+ (results['research']-techbit['research'])+'", tech'+tech2buy+' = "1" WHERE  playerid = "'+connection.name+'"');
						updateResources(connection);
						break;
					}
					else {
						connection.sendUTF("Tech NOT Purchased.  You did not meet the tech requirements.");
						break;
					}
					break;
				}
				else if (results['tech'+tech2buy]==1 && techbit['techid']==tech2buy){
					connection.sendUTF("You already own this tech.");
				}
				else if ( techbit['techid']==tech2buy && techbit['metal']<=results['metal'] && techbit['crystal']<=results['crystal'] && techbit['research']<=results['research']){
					connection.sendUTF("You do not have enough resources to buy this tech..");
				}
			}
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
                                                        connection.sendUTF("ownsector:"+sectorinfo['sectorid'].toString(16).toUpperCase());
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

							client.query('UPDATE map'+gameID+' SET totalship1 = totalship1 + '+sector['totship1build']+' + '+sector['totship1coming']+', totship1build = 0, totship1coming = 0 WHERE sectorid = '+sector['sectorid']);
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
	}
}
