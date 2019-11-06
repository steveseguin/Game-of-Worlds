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
	document.getElementById('mainsector').style.backgroundImage='url(planet2.png)';
	document.getElementById('planetname').innerHTML='Name: '+planetid;
	document.getElementById('planetsize').innerHTML='Type: '+planetid;
	document.getElementById('planetenviro').innerHTML='Environment: '+planetid;
	document.getElementById('planetunique').innerHTML='Unique: '+planetid;
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
function disableSelection(target){  // Make Text Unselectable

    if (typeof target.onselectstart!="undefined") //IE route
        target.onselectstart=function(){return false}

    else if (typeof target.style.MozUserSelect!="undefined") //Firefox route
        target.style.MozUserSelect="none"

    else //All other route (ie: Opera)
        target.onmousedown=function(){return false}

    //target.style.cursor = "default";
}
