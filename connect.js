server = "ws://107.21.126.134:1337";
turnTimer = 60*3;
turnInterval='';
// creating a WebSocket object causes it
// to connect to the server
if (window.MozWebSocket) {
  window.WebSocket = window.MozWebSocket;
}
websocket = new WebSocket(server);
 
// called once the connection is established
websocket.onopen = function(evt) {
    var authUserID = authUser();
    document.getElementById("chat").style.visibility = 'visible';
    document.getElementById("status").innerHTML = "Connected ("+authUserID+")";
};
 
// called upon receipt of a message
websocket.onmessage = function(evt) {
    if (evt.data.indexOf("$^$")==0){
    		document.getElementById("connected").innerHTML = evt.data.split("$^$")[1];
	}
    else if (evt.data.indexOf("battle:")===0){
		battle(evt);
	}
    else if (evt.data.indexOf("lobby::")===0){
	}
    else if (evt.data.indexOf("maxbuild::")===0){
	if (evt.data.split(":")[2]==1){document.getElementById("bb1").style.background = "#222";}
	else  if (evt.data.split(":")[2]==2){document.getElementById("bb2").style.background =  "#222";}
	else  if (evt.data.split(":")[2]==3){document.getElementById("bb3").style.background =  "#222";}
        }
    else if (evt.data.indexOf("pl:")===0){
	 	// if (evt.data.split(":")[1]){document.getElementById("player1name").innerHTML = "Player "+evt.data.split(":")[1];}
		// if (evt.data.split(":")[2]){document.getElementById("player2name").innerHTML = "Player "+evt.data.split(":")[2];}
                // if (evt.data.split(":")[3]){document.getElementById("player3name").innerHTML = "Player "+evt.data.split(":")[3];}
                // if (evt.data.split(":")[4]){document.getElementById("player4name").innerHTML = "Player "+evt.data.split(":")[4];}
                // if (evt.data.split(":")[5]){document.getElementById("player5name").innerHTML = "Player "+evt.data.split(":")[5];}
                // if (evt.data.split(":")[6]){document.getElementById("player6name").innerHTML = "Player "+evt.data.split(":")[6];}
                // if (evt.data.split(":")[7]){document.getElementById("player7name").innerHTML = "Player "+evt.data.split(":")[7];}
                // if (evt.data.split(":")[8]){document.getElementById("player8name").innerHTML = "Player "+evt.data.split(":")[8];}
	}
    else if (evt.data.indexOf("probeonly:")===0){
		if (confirm('You do not control this sector. Would you like to use a probe to scan it? (cost: 300 Crystal)')){
			websocket.send("//probe:"+evt.data.split(":")[1]);			
		}
	}
    else if (evt.data.indexOf("mmoptions:")===0){
		 mmfleet(evt);
	}
    else if (evt.data=="newround:"){
		document.getElementById("nextTurnText").innerHTML='Next Turn';
		document.getElementById("turnRedFlashWhenLow").innerHTML='180s';
		turnTimer = 60 * 3 - 1;
		clearInterval(turnInterval);
		turnInterval = setInterval(updateTimer,1000);
	}
    else if (evt.data.indexOf("ownsector:")==0){
		colorSector(evt);
        }
    else if (evt.data.indexOf("fleet:")==0){
                updateFleet(evt);
        }
    else if (evt.data.indexOf("tech:")==0){
		modTech(evt);
        }
    else if (evt.data=="start10:"){
		document.getElementById("nextTurnText").innerHTML='';
                document.getElementById("turnRedFlashWhenLow").innerHTML='10s';
                turnTimer = 9;
                clearInterval(turnInterval);
                turnInterval = setInterval(updateTimer,1000);
        }
    else if (evt.data.indexOf("sector:")==0){
		getSector(evt);
        }
    else if (evt.data.indexOf("info:")==0){
                setInfo(evt);
        }
    else if (evt.data.indexOf("ub:")==0){
                updateBuilds(evt);
        }
    else if (evt.data.indexOf("resources:")==0){
                getResources(evt);
        }
    else {
		startchatfade();
		document.getElementById("log").innerHTML = evt.data+"<br>";
		pushLog();
		if(document.getElementById("log").innerHTML.length > 1500) {
    			document.getElementById("log").innerHTML = "</font>..."+document.getElementById("log").innerHTML.substring(document.getElementById("log").innerHTML.length-1500,document.getElementById("log").innerHTML.length);
		}
		document.getElementById("log").scrollTop = 1600;
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

function setInfo(evt){
        tileNumber = evt.data.split(':')[1];
        sectype =  evt.data.split(':')[2];
        if (sectype == 2){
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(0,0,0)");
		document.getElementById('colonizedtxt'+tileNumber).textContent="BH";
        }
        else if (sectype == 1){
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(100,40,20)");
                document.getElementById('colonizedtxt'+tileNumber).textContent="A";
        }
        else {
		document.getElementById('txtfleetid'+tileNumber).textContent="";
		document.getElementById('colonizedtxt'+tileNumber).textContent="";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(200,0,0)");
        }

}
function battle(evt){
        var divTag = document.createElement("div");
        divTag.id = "battleGround";
        divTag.style.position = "absolute";
        divTag.style.left = "10%";
        divTag.style.width = "80%";
        divTag.style.height = "80%";
        divTag.style.top = "10%";
	divTag.style.background = "#000";
	divTag.style.backgroundImage = "url(spacebak.jpg)"; 
        document.body.appendChild(divTag);

	divTag = document.createElement("button");
        divTag.id = "stopBattle";
	divTag.onclick = killBattle;
        divTag.style.position = "absolute";
        divTag.style.right = "15%";
        divTag.style.width = "5%";
        divTag.style.height = "3%";
        divTag.style.top = "10%";
	divTag.innerHTML = "SKIP";
        document.getElementById('battleGround').appendChild(divTag);


        divTag = document.createElement("h1");
        divTag.id = "atttxt";
        divTag.style.position = "absolute";
        divTag.style.right = "15%";
        divTag.style.top = "12%";
        divTag.innerHTML = "Attackers";
        document.getElementById('battleGround').appendChild(divTag);

        divTag = document.createElement("h1");
        divTag.id = "deftxt";
        divTag.style.position = "absolute";
        divTag.style.right = "80%";
        divTag.style.top = "12%";
        divTag.innerHTML = "Defenders";
        document.getElementById('battleGround').appendChild(divTag);

		i=0;
		for (y=0;y<9;y++){
		   a1 =evt.data.split(":")[1+i+y];
 	     	   for (x=0;x<a1;x++){
			divTag1 = document.createElement("img");
			divTag1.id = "1a"+x+y;
			divTag1.style.position = "absolute";
			divTag1.style.left = ""+Math.round(Math.random()*20+60)+"%";
			divTag1.style.top = ""+Math.round(Math.random()*60+20)+"%";
			divTag1.style.webkitTransform = "scaleX(-1)";
			divTag1.src = "ship"+(y+1)+".png";
		        document.getElementById('battleGround').appendChild(divTag1);
		   }
		}
	
                for (y=0;y<9;y++){
                   d1 =evt.data.split(":")[10+i+y];
                   for (x=0;x<d1;x++){
                        divTag1 = document.createElement("img");
                        divTag1.id = "1d"+x+y;
                        divTag1.style.position = "absolute";
			divTag1.style.left = ""+Math.round(Math.random()*20+20)+"%";
                        divTag1.style.top = ""+Math.round(Math.random()*60+20)+"%";
                        divTag1.src = "ship"+(y+1)+".png";
                        document.getElementById('battleGround').appendChild(divTag1);
                   }
                }
		   
		   d1 =evt.data.split(":")[10+i+y];
                   for (x=0;x<d1;x++){
                        divTag1 = document.createElement("img");
                        divTag1.id = "1d"+x+y;
                        divTag1.style.position = "absolute";
                        divTag1.style.left = "0%";
                        divTag1.style.top = "10%";
			divTag1.style.height = "90%";
                        divTag1.src = "ground.gif";
                        document.getElementById('battleGround').appendChild(divTag1);
                   }
		   y++;
                   d1 =evt.data.split(":")[10+i+y];
            	   for (x=0;x<d1;x++){
	                divTag1 = document.createElement("img");
                        divTag1.id = "1d"+x+y;
                        divTag1.style.position = "absolute";
                        divTag1.style.left = "15%";
                        divTag1.style.top = "60%";
                        divTag1.src = "base.png";
                        document.getElementById('battleGround').appendChild(divTag1);
        	   }
		for (i = 1; (i+1)*20 < (evt.data.split(":").length); i++){
			setTimeout(boomShips,5000*i,evt.data,i);
		}
			setTimeout(killBattle,20000);
}
function killBattle(){
  var d = document.getElementById('battleGround');
  document.body.removeChild(d);
}
function boomShips(evtdata,i){
                for (y=0;y<9;y++){
                   a1 = evtdata.split(":")[1+i*20+y];
                   for (x=a1; x<evtdata.split(":")[1+y]; x++){
                                setTimeout(destroyShip, Math.random()*2000, "1a"+x+y);
                   }
                   a1 = evtdata.split(":")[10+i*20+y];
                   for (x=a1; x<evtdata.split(":")[10+y]; x++){
				setTimeout(destroyShip, Math.random()*2000, "1d"+x+y);
                   }
                }

}
function destroyShip(shipKILL){
	document.getElementById(shipKILL).src = "boom.gif";
}

function nextTurn(){
	websocket.send("//start");
}
function updateTimer() {
 			if (turnTimer<=0){
                                document.getElementById("turnRedFlashWhenLow").innerHTML=" (..loading)";
                        }
                        else {
                                document.getElementById("turnRedFlashWhenLow").innerHTML=turnTimer+"s";
                                turnTimer=turnTimer-1;
                        }
}
function buyTech(techid){
	 websocket.send("//buytech:"+techid);
}
function buyShip(shipid){
         websocket.send("//buyship:"+shipid);
}
function buyBuilding(buildingid){
         websocket.send("//buybuilding:"+buildingid);
}
function sendChat() {
	event.preventDefault();  // prevents the form onsubmit event from reloading the page like it does by default
	websocket.send(document.getElementById("chat").value);  // send the data over websocketsdocument.getElementById("chat")document.getElementById("chat")document.getElementById("chat")
	document.getElementById("chat").value = "";  // reset the chat input field
}
function changeSector(sect) {
	websocket.send("//sector "+sect);
}
function modTech(evt){
	 document.getElementById("tc1").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[1])+13)+5);
         document.getElementById("tt1").innerHTML=parseInt(evt.data.split(':')[1])+1;
         document.getElementById("tc2").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[2])+13)+5);
         document.getElementById("tt2").innerHTML=parseInt(evt.data.split(':')[2])+1;
         document.getElementById("tc3").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[3])+13)+5);
         document.getElementById("tt3").innerHTML=parseInt(evt.data.split(':')[3])+1;
         document.getElementById("tc4").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[4])+13)+5);
         document.getElementById("tt4").innerHTML=parseInt(evt.data.split(':')[4])+1;
         document.getElementById("tc5").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[5])+13)+5);
         document.getElementById("tt5").innerHTML=parseInt(evt.data.split(':')[5])+1;
         document.getElementById("tc6").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[6])+13)+5);
         document.getElementById("tt6").innerHTML=parseInt(evt.data.split(':')[6])+1;
         document.getElementById("tc7").innerHTML=Math.round(Math.pow(8,parseInt(evt.data.split(':')[7])+2)+36);
         document.getElementById("tt7").innerHTML=parseInt(evt.data.split(':')[7])+1;
         document.getElementById("tc8").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[8])+13)+5);
         document.getElementById("tt8").innerHTML=parseInt(evt.data.split(':')[8])+1;
         document.getElementById("tc9").innerHTML=Math.round(Math.pow(1.5,parseInt(evt.data.split(':')[9])+13)+5);
         document.getElementById("tt9").innerHTML=parseInt(evt.data.split(':')[9])+1;

         document.getElementById("ttt1").innerHTML=parseInt(evt.data.split(':')[1]);
         document.getElementById("ttt2").innerHTML=parseInt(evt.data.split(':')[2]);
         document.getElementById("ttt3").innerHTML=parseInt(evt.data.split(':')[3]);
         document.getElementById("ttt4").innerHTML=parseInt(evt.data.split(':')[4]);
         document.getElementById("ttt5").innerHTML=parseInt(evt.data.split(':')[5]);
         document.getElementById("ttt6").innerHTML=parseInt(evt.data.split(':')[6]);
         document.getElementById("ttt7").innerHTML=parseInt(evt.data.split(':')[7]);
         document.getElementById("ttt8").innerHTML=parseInt(evt.data.split(':')[8]);
         document.getElementById("ttt9").innerHTML=parseInt(evt.data.split(':')[9]);

}
function colorSector(evt){
	tileNumber = evt.data.split(':')[1];
	fleetsize = evt.data.split(':')[2];
	coltxt = evt.data.split(':')[3]; 
	document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(50,255,50)");

	if (fleetsize != 0 && fleetsize != undefined){
		document.getElementById('txtfleetid'+tileNumber).textContent="s:"+fleetsize;
        if (coltxt == "A"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="A";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(200,255,100)");
        }
        else if (coltxt == "C"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="C";
        }
        else if (coltxt == "BH"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="BH";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(200,255,100)");
        }
        else if (coltxt == "P"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="P";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(200,255,100)");
        }
        else if (coltxt == "H"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="H";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(200,255,100)");
        }
        else if (coltxt == "W"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="W";
        }
        else {
                document.getElementById('colonizedtxt'+tileNumber).textContent='';
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(70,150,70)");
        }
	}


	else {
		document.getElementById('txtfleetid'+tileNumber).textContent='';
         document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(40,200,40)");
        if (coltxt == "A"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="A";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(220,220,40)");
        }
        else if (coltxt == "C"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="C";
        }
        else if (coltxt == "BH"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="BH";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(220,220,40)");
        }
        else if (coltxt == "P"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="P";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(220,220,40)");
        }
        else if (coltxt == "H"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="H";
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(220,220,40)");
        }
        else if (coltxt == "W"){
                document.getElementById('colonizedtxt'+tileNumber).textContent="W";
        }
        else {
                document.getElementById('colonizedtxt'+tileNumber).textContent='';
                document.getElementById('tile'+tileNumber).setAttributeNS(null,"stroke","rgb(150,150,20)");

        }
	}
}
function getSector(evt){
                document.getElementById("log").scrollTop = 9999;
                document.getElementById('sectorimg').style.backgroundImage='url(type'+evt.data.split(":")[5]+'.gif)';
                document.getElementById('sectorid').innerHTML='Sector: '+evt.data.split(":")[1];
                document.getElementById('planetowner').innerHTML='Owner: '+evt.data.split(":")[3];
		
		if (evt.data.split(":")[5]==1){
                	document.getElementById('planettype').innerHTML='Type: Asteroid Belt';
		}
		else if (evt.data.split(":")[5]==2){
                        document.getElementById('planettype').innerHTML='Type: Blackhole';
                }
		else if  (evt.data.split(":")[5]==3){
                        document.getElementById('planettype').innerHTML='Type: Unstable Star';
                }
                else if  (evt.data.split(":")[5]==4){
                        document.getElementById('planettype').innerHTML='Type: Brown Dwarf';
                }
                else if  (evt.data.split(":")[5]==5){
                        document.getElementById('planettype').innerHTML='Type: Small Moon';
                }
		else if  (evt.data.split(":")[5]==6){
                        document.getElementById('planettype').innerHTML='Type: Micro Planet (4)';
                }
                else if  (evt.data.split(":")[5]==7){
                        document.getElementById('planettype').innerHTML='Type: Small Planet (6)';
                }
                else if  (evt.data.split(":")[5]==8){
                        document.getElementById('planettype').innerHTML='Type: Medium Planet (8)';
                }
                else if  (evt.data.split(":")[5]==9){
                        document.getElementById('planettype').innerHTML='Type: Large Planet (10)';
                }
                else if  (evt.data.split(":")[5]==10){
                        document.getElementById('planettype').innerHTML='Type: Homeworld Planet (12)';
                }
		if (evt.data.split(":")[5]>5){
                if (parseInt(evt.data.split(":")[9])<100){
                        document.getElementById('metalbonus').innerHTML='Metal Production:<font color="red"> '+evt.data.split(":")[9]+'%</font>';
                }
                else if (parseInt(evt.data.split(":")[9])>=200 ){
                        document.getElementById('metalbonus').innerHTML='Metal Production:<font color="green"> '+evt.data.split(":")[9]+'%</font>';
                }
                else {
                        document.getElementById('metalbonus').innerHTML='Metal Production:<font color="yellow"> '+evt.data.split(":")[9]+'%</font>';
                }
                if (parseInt(evt.data.split(":")[11])<100){
                        document.getElementById('crystalbonus').innerHTML='Crystal Production:<font color="red"> '+evt.data.split(":")[11]+'%</font>';
                }
                else if (parseInt(evt.data.split(":")[11])>=200 ){
                        document.getElementById('crystalbonus').innerHTML='Crystal Production:<font color="green"> '+evt.data.split(":")[11]+'%</font>';
                }
                else {
                        document.getElementById('crystalbonus').innerHTML='Crystal Production:<font color="yellow"> '+evt.data.split(":")[11]+'%</font>';
                }
		document.getElementById('terraformlvl').innerHTML='Terraform Req: '+evt.data.split(":")[13];
		}
		else {
			 document.getElementById('crystalbonus').innerHTML='N/A';
			 document.getElementById('metalbonus').innerHTML='N/A';
			 document.getElementById('terraformlvl').innerHTML='Cannot be colonized';
		}
}
function updateBuilds(evt){

        document.getElementById('buildtab').style.opacity = 1;
        document.getElementById('fleettab').style.opacity = 1;
        document.getElementById('build').style.opacity = 1;
        document.getElementById('fleet').style.opacity = 1;
	document.getElementById("bb1").style.background = "lightgreen";
	document.getElementById("bb2").style.background = "lightgreen";
	document.getElementById("bb3").style.background = "lightgreen";

if (document.getElementById('planettype').innerHTML.split("4")[1]==")"){
	if (parseInt(evt.data.split(":")[1])<4){
		document.getElementById("bb1").style.background = "lightgreen";
	}
	else {
		document.getElementById("bb1").style.background = "#222";
	}
        if (parseInt(evt.data.split(":")[2])<4){
                document.getElementById("bb2").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb2").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[3])<4){
                document.getElementById("bb3").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb3").style.background = "#222";
        }

}
else if (document.getElementById('planettype').innerHTML.split("6")[1]==")"){
        if (parseInt(evt.data.split(":")[1])<6){
                document.getElementById("bb1").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb1").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[2])<6){
                document.getElementById("bb2").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb2").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[3])<6){
                document.getElementById("bb3").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb3").style.background = "#222";
        }

}
else if (document.getElementById('planettype').innerHTML.split("8")[1]==")"){
        if (parseInt(evt.data.split(":")[1])<8){
                document.getElementById("bb1").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb1").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[2])<8){
                document.getElementById("bb2").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb2").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[3])<8){
                document.getElementById("bb3").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb3").style.background = "#222";
        }

}
else if (document.getElementById('planettype').innerHTML.split("10")[1]==")"){
        if (parseInt(evt.data.split(":")[1])<10){
                document.getElementById("bb1").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb1").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[2])<10){
                document.getElementById("bb2").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb2").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[3])<10){
                document.getElementById("bb3").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb3").style.background = "#222";
        }

}
else if (document.getElementById('planettype').innerHTML.split("12")[1]==")"){
        if (parseInt(evt.data.split(":")[1])<12){
                document.getElementById("bb1").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb1").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[2])<12){
                document.getElementById("bb2").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb2").style.background = "#222";
        }
        if (parseInt(evt.data.split(":")[3])<12){
                document.getElementById("bb3").style.background = "lightgreen";
        }
        else {
                document.getElementById("bb3").style.background = "#222";
        }
}
else {
	document.getElementById('build').style.opacity = 0.2;
        document.getElementById('fleet').style.opacity = 0.2;
	document.getElementById('buildtab').style.opacity = 0.2;
	document.getElementById('fleettab').style.opacity = 0.2;
}
		document.getElementById('bbb1').innerHTML=parseInt(evt.data.split(":")[1]);
                document.getElementById('bbb2').innerHTML=parseInt(evt.data.split(":")[2]);
                document.getElementById('bbb3').innerHTML=parseInt(evt.data.split(":")[3]);
                document.getElementById('bbb4').innerHTML=parseInt(evt.data.split(":")[4]);
                document.getElementById('bbb5').innerHTML=parseInt(evt.data.split(":")[5]);

                document.getElementById('b1').innerHTML=parseInt(evt.data.split(":")[1])+1;
                document.getElementById('b2').innerHTML=parseInt(evt.data.split(":")[2])+1;
                document.getElementById('b3').innerHTML=parseInt(evt.data.split(":")[3])+1;
                document.getElementById('b4').innerHTML=parseInt(evt.data.split(":")[4])+1;
                document.getElementById('b5').innerHTML=parseInt(evt.data.split(":")[5])+1;
                //document.getElementById('b6').innerHTML=parseInt(evt.data.split(":")[6])+1;
		if (parseInt(evt.data.split(":")[6])>0){
			document.getElementById("bb6").style.background = "#222";
		}
		else {document.getElementById("bb6").style.background = "orange";}

                document.getElementById('m1').innerHTML=(parseInt(evt.data.split(":")[1])+1)*100;
                document.getElementById('m2').innerHTML=(parseInt(evt.data.split(":")[2])+1)*100;
                document.getElementById('m3').innerHTML=(parseInt(evt.data.split(":")[3])+1)*100;
                document.getElementById('m4').innerHTML=(parseInt(evt.data.split(":")[4])+1)*100;
                document.getElementById('m5').innerHTML=(parseInt(evt.data.split(":")[5])+1)*100;
                //document.getElementById('m6').innerHTML=(parseInt(evt.data.split(":")[6])+1)*100;
}
function updateFleet(evt){

		updateShips(parseInt(evt.data.split(":")[1]),parseInt(evt.data.split(":")[2]),parseInt(evt.data.split(":")[3]),parseInt(evt.data.split(":")[4]),parseInt(evt.data.split(":")[5]),parseInt(evt.data.split(":")[6]))

                document.getElementById('f1').innerHTML=parseInt(evt.data.split(":")[1]);
                document.getElementById('f2').innerHTML=parseInt(evt.data.split(":")[2]);
                document.getElementById('f3').innerHTML=parseInt(evt.data.split(":")[3]);
                document.getElementById('f4').innerHTML=parseInt(evt.data.split(":")[4]);
                document.getElementById('f5').innerHTML=parseInt(evt.data.split(":")[5]);
                document.getElementById('f6').innerHTML=parseInt(evt.data.split(":")[6]);

                document.getElementById('fa1').innerHTML=parseInt(evt.data.split(":")[7]);
                document.getElementById('fa2').innerHTML=parseInt(evt.data.split(":")[8]);
                document.getElementById('fa3').innerHTML=parseInt(evt.data.split(":")[9]);
                document.getElementById('fa4').innerHTML=parseInt(evt.data.split(":")[10]);
                document.getElementById('fa5').innerHTML=parseInt(evt.data.split(":")[11]);
                document.getElementById('fa6').innerHTML=parseInt(evt.data.split(":")[12]);

		if (parseInt(evt.data.split(":")[7])<1){document.getElementById('fc1').style.display="none";}
			else {document.getElementById('fc1').style.display="inline";}
                if (parseInt(evt.data.split(":")[8])<1){document.getElementById('fc2').style.display="none";}
                        else {document.getElementById('fc2').style.display="inline";}
                if (parseInt(evt.data.split(":")[9])<1){document.getElementById('fc3').style.display="none";}
                        else {document.getElementById('fc3').style.display="inline";}
                if (parseInt(evt.data.split(":")[10])<1){document.getElementById('fc4').style.display="none";}
                        else {document.getElementById('fc4').style.display="inline";}
                if (parseInt(evt.data.split(":")[11])<1){document.getElementById('fc5').style.display="none";}
                        else {document.getElementById('fc5').style.display="inline";}
                if (parseInt(evt.data.split(":")[12])<1){document.getElementById('fc6').style.display="none";}
                        else {document.getElementById('fc6').style.display="inline";}


}
function getResources(evt){
                document.getElementById('metalresource').innerHTML=' '+evt.data.split(":")[1]+' Metal,';
                document.getElementById('crystalresource').innerHTML=' '+evt.data.split(":")[2]+' Crystal,';
                document.getElementById('researchresource').innerHTML=' '+evt.data.split(":")[3]+' Research,';
}
