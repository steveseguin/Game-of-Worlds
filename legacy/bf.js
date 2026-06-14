var hovertimer;
var thisID;
var chatHistory = [];
var chatHistoryTime = [];
var timeSinceCounter;
var buttonDown=0;
var buttonTimer;

function sendmmf(){
        var i;
	var list2send=document.getElementById('sectorofattack').innerHTML;
	alert(document.getElementById('sectorofattack').innerHTML);
	var totalships=0;
        for(i = document.getElementById('shipsFromNearBy').options.length-1;i>=0;i--){
                if (document.getElementById('shipsFromNearBy').options[i].selected){
			list2send+=":"+document.getElementById('shipsFromNearBy').options[i].value;
			totalships++;
			alert('totalshps+');
		}
        }
	arr = list2send.split(":");
	sumofships=0;
        for (y=3;y<=(arr.length-1);y+=3){
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
	alert ('list2send:'+list2send);
	if (confirm('Are you sure you wish to send these '+totalships+' ships to sector '+document.getElementById('sectorofattack').innerHTML+'?        It will cost you '+(sumofships*100)+' crystal.')){
		 websocket.send("//sendmmf:"+list2send);
		 document.getElementById('multiMove').style.display='none';
	} 
}
function mmfleet(evt){
	var optn;
	sid = evt.data.split(':')[1];

	var i;
        for(i = document.getElementById('shipsFromNearBy').options.length-1;i>=0;i--){
                document.getElementById('shipsFromNearBy').remove(i);
        }

        document.getElementById('sectorofattack').innerHTML=sid;
        document.getElementById('multiMove').style.display='block';

	arr =  evt.data.split(':');
	shipid = '';
	shipname = '';
	for (i in arr){
		shipid='';
		shipname='';
                if ((i-2)%7==1){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Corvette "+x+" in sector "+arr[i-1];
				shipid=arr[i-1]+":1:"+x;
                		optn = document.createElement("OPTION");
                		optn.text = shipname;
        	        	optn.value = shipid;
	                	document.getElementById('shipsFromNearBy').options.add(optn);
                        }
                }
                else if ((i-2)%7==2){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Destroyer "+x+" in sector "+arr[i-2];
                                shipid=arr[i-2]+":2:"+x;
                optn = document.createElement("OPTION");
                optn.text = shipname;
                optn.value = shipid;
                document.getElementById('shipsFromNearBy').options.add(optn);	}
                }
                else if ((i-2)%7==3){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Scout "+x+" in sector "+arr[i-3];
                                shipid=arr[i-3]+":3:"+x;
                optn = document.createElement("OPTION");
                optn.text = shipname;
                optn.value = shipid;
                document.getElementById('shipsFromNearBy').options.add(optn);
                        }
                }
                else if ((i-2)%7==4){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Cruiser "+x+" in sector "+arr[i-4];
                                shipid=arr[i-4]+":4:"+x;
                optn = document.createElement("OPTION");
                optn.text = shipname;
                optn.value = shipid;
                document.getElementById('shipsFromNearBy').options.add(optn);
                        }
                }
                else if ((i-2)%7==5){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Dreadnought "+x+" in sector "+arr[i-5];
                                shipid=arr[i-5]+":5:"+x;
                optn = document.createElement("OPTION");
                optn.text = shipname;
                optn.value = shipid;
                document.getElementById('shipsFromNearBy').options.add(optn);
                        }
                }
                else if ((i-2)%7==6){
                        for (x = 1;x<=arr[i];x++){
                                shipname="Colony Ship "+x+" in sector "+arr[i-6];
                                shipid=arr[i-6]+":6:"+x;
                optn = document.createElement("OPTION");
                optn.text = shipname;
                optn.value = shipid;
                document.getElementById('shipsFromNearBy').options.add(optn);
                        }
                }
	}
}
function updateShips(s1,s2,s3,s4,s5,s6){
	var i;
	for(i = document.getElementById('shipsTo').options.length-1;i>=0;i--){
                document.getElementById('shipsTo').remove(i);
        }
        for(i = document.getElementById('shipsFrom').options.length-1;i>=0;i--){
                document.getElementById('shipsFrom').remove(i);
        }

	var optn;
        
	for (i=0;i<s1;i++){
		optn = document.createElement("OPTION");
                document.getElementById('shipsFrom').options.add(optn);
                optn.innerText = "Corvette "+(i+1);
                optn.value = "a"+(i+1);
        }
        for (i=0;i<parseInt(s2);i++){
                optn = document.createElement("OPTION");
                optn.text = "Destroyer "+(i+1);
                optn.value = "b"+(i+1);
                document.getElementById('shipsFrom').options.add(optn);
        }
        for (i=0;i<s3;i++){
                optn = document.createElement("OPTION");
                optn.text = "Scout "+(i+1);
                optn.value = "c"+(i+1);
                document.getElementById('shipsFrom').options.add(optn);
        }
        for (i=0;i<s4;i++){
                optn = document.createElement("OPTION");
                optn.text = "Cruiser "+(i+1);
                optn.value = "d"+(i+1);
                document.getElementById('shipsFrom').options.add(optn);
        }
        for (i=0;i<s5;i++){
                optn = document.createElement("OPTION");
                optn.text = "Dreadnaught "+(i+1);
                optn.value = "e"+(i+1);
                document.getElementById('shipsFrom').options.add(optn);
        }
        for (i=0;i<s6;i++){
                optn = document.createElement("OPTION");
                optn.text = "Colony Ship "+(i+1);
                optn.value = "f"+(i+1);
                document.getElementById('shipsFrom').options.add(optn);
        }

}
function moveShips(selectbox,selectbox2)
{
	var optn;
	for(var i=selectbox.options.length-1;i>=0;i--)
	{
		if(selectbox.options[i].selected){
			optn = document.createElement("OPTION");
			optn.text = selectbox.options[i].text;
		        optn.value = selectbox.options[i].value;
		
			selectbox2.options.add(optn);
			selectbox.remove(i);		
		}
	}
}
function hoverInfo(itemID){
				document.getElementById(itemID).style.display='inline';
                                var temp = 505;
                                document.getElementById(itemID).style.left=temp;
                                temp = parseInt(thisID.offsetTop)-169;
                                document.getElementById(itemID).style.top=temp;
}
function makeActive(thisElement, thisClass){
 var foundbuttons = document.getElementById('controlPadGUI').getElementsByTagName('button');
        for (var i = 0; i < foundbuttons.length; ++i) {
                var item = foundbuttons[i];
                if (item.className==thisClass){
                        item.style.backgroundColor='';
                }
        }
thisElement.style.backgroundColor='lightblue';	
}


function popupSelectDestination(){
	var destination = prompt("Enter destination Sector ID:","ie: 3A");
        var s1=0,s2=0,s3=0,s4=0,s5=0,s6=0;
	for (var i = document.getElementById('shipsTo').options.length-1;i>=0;i--){
		if (document.getElementById('shipsTo').options[i].value.indexOf('a')==0){s1++;}
		else if (document.getElementById('shipsTo').options[i].value.indexOf('b')==0){s2++;}
                else if (document.getElementById('shipsTo').options[i].value.indexOf('c')==0){s3++;}
                else if (document.getElementById('shipsTo').options[i].value.indexOf('d')==0){s4++;}
                else if (document.getElementById('shipsTo').options[i].value.indexOf('e')==0){s5++;}
                else if (document.getElementById('shipsTo').options[i].value.indexOf('f')==0){s6++;}
        }
	websocket.send("//move::"+destination+":"+s1+":"+s2+":"+s3+":"+s4+":"+s5+":"+s6);
}
function showClass(theClass) {
        var foundbuttons = document.getElementById('controlPadGUI').getElementsByTagName('button');
	for (var i = 0; i < foundbuttons.length; ++i) {  
	  	var item = foundbuttons[i];
                if (item.className==theClass){
                        item.style.display='inline';
                }
		else if (item.className.indexOf('tier')==0){
			item.style.display='none';
		}
	}  
}
function showClassF(theClass) {
        var foundbuttons = document.getElementById('controlPadGUI').getElementsByTagName('div');
        for (var i = 0; i < foundbuttons.length; ++i) {
                var item = foundbuttons[i];
                if (item.className==theClass){
                        item.style.display='inline';
                }
                else if (item.className.indexOf('fleet')==0){
                        item.style.display='none';
                }
        }
}
function showShip(theClass) {
        var foundbuttons = document.getElementById('controlPadGUI').getElementsByTagName('div');
        for (var i = 0; i < foundbuttons.length; ++i) {
                var item = foundbuttons[i];
                if (item.id==theClass){
                        item.style.display='inline';
                }
                else if (item.id.indexOf('ship')==0){
                        item.style.display='none';
                }
        }
}
function slideHideButtonBottom(divId){
        var widthx=parseInt(document.getElementById(divId).style.height);
        var positionx=parseInt(document.getElementById(divId).style.bottom);
        if (positionx>=0){
                slideHideButtonBottomClose(divId);
        }
        else if (-positionx>=widthx+5) {
                slideHideButtonBottomOpen(divId);
        }
}
function slideHideButtonBottomClose(divId){
        var widthx=parseInt(document.getElementById(divId).style.height);
        var positionx=parseInt(document.getElementById(divId).style.bottom);
        if (-positionx<widthx+5){
                        var speeD = Math.abs(Math.round(Math.pow((widthx+positionx)/(-positionx+widthx),2)*70+2));
                        positionx=positionx-speeD;
                        document.getElementById(divId).style.bottom=positionx+'px';
                        if (-positionx<widthx+5){
                                setTimeout(function(){slideHideButtonBottomClose(divId);},20);
                        }
        }
        else{
                widthx=-(widthx+5)
                document.getElementById(divId).style.bottom=widthx+'px';
        }
}
function slideHideButtonBottomOpen(divId){
        var widthx=parseInt(document.getElementById(divId).style.height);
        var positionx=parseInt(document.getElementById(divId).style.bottom);
        if (positionx<0){
                        var speeD = Math.abs(Math.round(Math.pow((positionx)/(-positionx+widthx),2)*100+1));
                        positionx=positionx+speeD;
                        document.getElementById(divId).style.bottom=positionx+'px';
                        if (positionx<0){
                                setTimeout(function(){slideHideButtonBottomOpen(divId);},20);
                        }
        }
        else{
                document.getElementById(divId).style.bottom='0px';
        }
}

function slideHideButtonRight(divId){
	var widthx=parseInt(document.getElementById(divId).style.width);
        var positionx=parseInt(document.getElementById(divId).style.right);
	if (positionx>=0){
		slideHideButtonRightClose(divId);
	}
	else if (-positionx>=widthx+5) {
		slideHideButtonRightOpen(divId);
	}
}
function slideHideButtonRightClose(divId){
        var widthx=parseInt(document.getElementById(divId).style.width);
        var positionx=parseInt(document.getElementById(divId).style.right);
        if (-positionx<widthx+5){
			var speeD = Math.abs(Math.round(Math.pow((widthx+positionx)/(-positionx+widthx),2)*70+2));
                        positionx=positionx-speeD;
                        document.getElementById(divId).style.right=positionx+'px';
			if (-positionx<widthx+5){
                        	setTimeout(function(){slideHideButtonRightClose(divId);},20);
        		}
	}
	else{
		widthx=-(widthx+5)
                document.getElementById(divId).style.right=widthx+'px';
        }
}
function slideHideButtonRightOpen(divId){
        var widthx=parseInt(document.getElementById(divId).style.width);
        var positionx=parseInt(document.getElementById(divId).style.right);
        if (positionx<0){
                        var speeD = Math.abs(Math.round(Math.pow((positionx)/(-positionx+widthx),2)*100+1));
                        positionx=positionx+speeD;
                        document.getElementById(divId).style.right=positionx+'px';
                        if (positionx<0){
				setTimeout(function(){slideHideButtonRightOpen(divId);},20);
        		}
	}
	else{
		document.getElementById(divId).style.right='0px';
	}
}



function updateSector(planetid){
	changeSector(planetid);
}

var tilefading='';
function fade(startcolor,endcolor,evtt){
    	var fadetimer;
	var colorNumber = parseInt(startcolor, 16);
	var endNumber = parseInt(endcolor, 16);
	var hexString = '';
	evtt.setAttribute('fill', '#'+startcolor);

	fadeagain();

	function fadeagain(){
	     
	     if (tilefading != evtt){	
		if (colorNumber>endNumber){
				colorNumber = colorNumber-131586;
				hexString = '#'+colorNumber.toString(16);
				evtt.setAttribute('fill', hexString);
				fadetimer = setTimeout(fadeagain,20);
		}
		else if (colorNumber<endNumber) {
                        	colorNumber = colorNumber+131586;
				hexString = '#'+colorNumber.toString(16);
				evtt.setAttribute('fill', hexString);
				fadetimer = setTimeout(fadeagain,20);
		}
		else {
			 evtt.setAttribute('fill', '#'+endcolor);
		}
	    }
	}
     
}

function setalpha(itemid,opvalue){
	itemid.style.filter = 'alpha(opacity='+opvalue+')';
	opvalue=opvalue/100;
	itemid.style.opacity=opvalue;
}

var chatfadetimer;
var chatfadebegin;
var chatfadevalue=100;
function chatfade(logid){
	chatfade2();
	function chatfade2(){
           if (chatfadevalue>0){
		chatfadevalue-=2;
		setalpha(logid,chatfadevalue);
		chatfadetimer = setTimeout(chatfade2,60);

           }
	}
}
var chatID=1;
function pushLog(){
	var d = new Date();
	document.getElementById('timeSince').innerHTML="0 seconds ago.";
	chatHistoryTime.push(d.getTime());
	chatHistory.push(document.getElementById("log").innerHTML);
	clearInterval(timeSinceCounter);
	timeSinceCounter = setInterval("timelogupdate(1)",1000);
	chatID=1;
}
function showChatHistory(){
	chatID++;
	if (chatID>chatHistoryTime.length){chatID=chatHistoryTime.length;}
	var d = new Date();
	document.getElementById("log").innerHTML=chatHistory[chatHistory.length-chatID];
	document.getElementById('timeSince').innerHTML=Math.round((d.getTime()-chatHistoryTime[chatHistoryTime.length-chatID])/1000)+" seconds ago.";
	startchatfade();
}
function timelogupdate(){
	var d = new Date();
	document.getElementById('timeSince').innerHTML=Math.round((d.getTime()-chatHistoryTime[chatHistoryTime.length-parseInt(chatID)])/1000)+" seconds ago.";
}
function startchatfade(){
                clearTimeout(chatfadetimer);
                clearTimeout(chatfadebegin);
                setalpha(document.getElementById("empireupdates"),100);
                chatfadevalue=100;
                chatfadebegin = setTimeout('chatfade(document.getElementById("empireupdates"))',16000);
}

function disableSelection(target){  // Make Text Unselectable

    if (typeof target.onselectstart!="undefined") //IE route
        target.onselectstart=function(){return false}

    else if (typeof target.style.MozUserSelect!="undefined") //Firefox route
        target.style.MozUserSelect="none"

    else //All other route (ie: Opera)
        target.onmousedown=function(){return false}

    target.style.cursor = "default"
}
