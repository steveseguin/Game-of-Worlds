<?php

function reConnectWindow(){
	echo "
		<div id=\"lobbyWindow\" style=\"
			display:none;
			position:absolute;
			left:10%;
			top:10%;
			width:80%;
			height:80%;
			background-color:#333;
			border:5px solid #444;
		\">
			<center><br /><br /><h1>THE CONNECTION WAS LOST</h1><br />Please refresh the page to reconnect.<br /><br /><button onclick=\"location.reload(true)\" style=\"padding:20px;\">Refresh this page</button></center>
		</div>
	";
}
function controlPadBackground(){
 	echo "
      	<div id=\"controlPadGUI\" style=\"
		position:absolute;
		bottom:0;left:0;
                text-align:center;
		width:495px;height:100%;
		padding:0;margin:0;;
		border-top:5px solid #222;
		\" >
	   <div id=\"techtab\"
		class=\"mainMenu\"
		onclick=\"
                        document.getElementById('fleet').style.display='none';
                        document.getElementById('techtree').style.display='inline';
                        document.getElementById('build').style.display='none';
			document.getElementById('colonizediv').style.display='none'
                        document.getElementById('fleetinfo').style.display='none';
			\"
		onMouseover=\"
			this.style.backgroundColor='#222';
			\"
		onMouseout=\"
                        this.style.backgroundColor='#333';
                        \"
		onMousedown=\"
                        this.style.backgroundColor='#111';
                        \"
		onMouseup=\"
                        this.style.backgroundColor='#222';
                        \"
		style=\"
                        cursor: pointer;
                        position:absolute;
                        bottom:360px;left:0;
                        width:260px;height:50px;
                        padding:0;margin:0px;
                        background-color:#333;
                        border-bottom:5px solid #444;
                        border-right:5px solid #222;
                        overflow:hidden;
			\"
		>
		<div style='margin:5px;'><b>Research Technologies</b></div>
           </div>
	   <div  id=\"sectortab\"
                class=\"mainMenu\"
                onclick=\"
                        document.getElementById('build').style.display='none';
                        document.getElementById('fleet').style.display='none';
                        document.getElementById('techtree').style.display='none';
                        document.getElementById('colonizediv').style.display='none';
                        document.getElementById('fleetinfo').style.display='inline';
                        \"
                onMouseover=\"
                        this.style.backgroundColor='#222';
                        \"
                onMouseout=\"
                        this.style.backgroundColor='#333';
                        \"
                onMousedown=\"
                        this.style.backgroundColor='#111';
                        \"
                onMouseup=\"
                        this.style.backgroundColor='#222';
                        \"
                style=\"
                        cursor: pointer;
                        position:absolute;
                        bottom:540px;left:0;
                        width:260px;height:50px;
                        padding:0;margin:0px;
                        background-color:#333;
                        border-bottom:5px solid #444;
                        border-right:5px solid #222;
                        overflow:hidden;
                        \" >
                <div style='margin:5px;'><b>Empire Overview</b></div>
           </div>

  	   <div  id=\"buildtab\"
		class=\"mainMenu\"
                onclick=\"
                        document.getElementById('build').style.display='inline';
                        document.getElementById('fleet').style.display='none';
                        document.getElementById('techtree').style.display='none';
                        document.getElementById('colonizediv').style.display='none';
                        document.getElementById('fleetinfo').style.display='none';
                        \"
                onMouseover=\"
                        this.style.backgroundColor='#222';
                        \"
                onMouseout=\"
                        this.style.backgroundColor='#333';
                        \"
                onMousedown=\"
                        this.style.backgroundColor='#111';
                        \"
                onMouseup=\"
                        this.style.backgroundColor='#222';
                        \"
                style=\"
                        cursor: pointer;
                        position:absolute;
                        bottom:420px;left:0;
                        width:260px;height:50px;
                        padding:0;margin:0px;
                        background-color:#333;
                        border-bottom:5px solid #444;
                        border-right:5px solid #222;
                        overflow:hidden;
                        \" >
		<div style='margin:5px;'><b>Upgrade Sector</b></div>
           </div>
	   <div id=\"fleettab\"
    	 	class=\"mainMenu\"
                onclick=\"
                        document.getElementById('fleet').style.display='inline';
			document.getElementById('techtree').style.display='none';
                        document.getElementById('build').style.display='none';
                        document.getElementById('colonizediv').style.display='none';
                        document.getElementById('fleetinfo').style.display='none';
                        \"
                onMouseover=\"
                        this.style.backgroundColor='#222';
                        \"
                onMouseout=\"
                        this.style.backgroundColor='#333';
                        \"
                onMousedown=\"
                        this.style.backgroundColor='#111';
                        \"
                onMouseup=\"
                        this.style.backgroundColor='#222';
                        \"
                style=\"
                        cursor: pointer;
                        position:absolute;
                        bottom:480px;left:0;
                        width:260px;height:50px;
                        padding:0;margin:0px;
                        background-color:#333;
                        border-bottom:5px solid #444;
                        border-right:5px solid #222;
                        overflow:hidden;
                        \"
		>
		<div style='margin:5px;'><b>Build Ships</b></div>
	   </div>
           <div id=\"colonizetab\"
                class=\"mainMenu\"
                onclick=\"
                        document.getElementById('fleet').style.display='none';
                        document.getElementById('techtree').style.display='none';
                        document.getElementById('build').style.display='none';
                        document.getElementById('colonizediv').style.display='inline';
                        document.getElementById('fleetinfo').style.display='none';
                        \"
                onMouseover=\"
                        this.style.backgroundColor='#222';
                        \"
                onMouseout=\"
                        this.style.backgroundColor='#333';
                        \"
                onMousedown=\"
                        this.style.backgroundColor='#111';
                        \"
                onMouseup=\"
                        this.style.backgroundColor='#222';
                        \"
                style=\"
                        cursor: pointer;
                        position:absolute;
                        bottom:300px;left:0;
                        width:260px;height:50px;
                        padding:0;margin:0px;
                        background-color:#333;
                        border-bottom:5px solid #444;
                        border-right:5px solid #222;
                        overflow:hidden;
                        \"
                >
                <div style='margin:5px;'><b>Colonize Planet</b></div>
           </div>
";
           comcolonize();
           comtech();
           combuild();
           comfleet();

	   echo "
		<script>
		disableSelection(document.getElementById(\"techtab\"));
		disableSelection(document.getElementById(\"buildtab\"));
		disableSelection(document.getElementById(\"fleettab\"));
                disableSelection(document.getElementById(\"colonizetab\"));
        	</script>
	   ";
	   chatWindow();
	   drawTab('controlPadGUI','com','Bottom');
	   echo "
        </div>
        ";
}
function drawTab($tabtoslideID,$tabName,$side2slide){
	$tabLocation = "";
	$transformTab="";
	$squareSize="";
	$stroke="";
	$textLocal="";
	if ($side2slide=="Right"){$stroke="444";$tabLocation ="left:-40px;top:50px;";$textLocal="x=\"-68px\" y=\"64px\"";$transformTab="transform=\"rotate(-90 4 40)\"";$squareSize="width:40px;height:120px;";}
	else if ($side2slide=="Bottom"){$stroke="222";$tabLocation="right:-5px;top:-40px;";$textLocal="x=\"20px\" y=\"30px\"";$transformTab="";$squareSize="width:120px;height:40px;";}
	echo "
		<svg onclick=\"slideHideButton".$side2slide."('".$tabtoslideID."');\" style=\"".$squareSize."position:absolute;".$tabLocation."border:0;\">
			<rect width=\"100%\" height=\"100%\" style=\"fill:rgb(140,140,140);stroke:#".$stroke.";stroke-width:10px;\" />
			<text id=\"".$tabName."texttabid\" ".$textLocal." style=\"stroke: #000; fill:#ddd;\"  ".$transformTab." font-size=\"33\" font-weight=\"bold\" >".$tabName."</text>
		</svg>
		<script>
 			disableSelection(document.getElementById(\"".$tabName."texttabid\"));
		</script>
	";
}

function tile($x = 0, $y=0, $pathid="tile") {
	echo "
        <svg viewBox=\"0 0 110 100\" id=\"tileholder".$pathid."\" width=\"41px\" height=\"37px\" style=\"position:absolute;bottom:".$y."px;right:".$x."px;\" >
            <path
                onmouseover=\"tilefading=evt.target;evt.target.setAttribute('fill', '#bbb');\"
                onmouseup=\"evt.target.setAttribute('fill', '#bbb');clearTimeout(buttonTimer);if (buttonDown==1){buttonDown=0;} else {buttonDown=0; updateSector('tile".$pathid."');}\"
                onmousedown=\"evt.target.setAttribute('fill', '#888'); buttonDown=0; buttonTimer = setTimeout(function(){buttonDown=1;evt.target.setAttribute('fill', '#ECA100'); websocket.send('//mmove:".$pathid."');},500);\"
		onmouseout=\"tilefading='';fade('bbbbbb','dddddd',evt.target);\"
                id=\"tile".$pathid."\"
                fill=\"#ddd\"
                stroke=\"bbb\"
                stroke-width=\"10\"
                d=\"m 97,51 -25,43.30127 -50,0 L -3,51 22,7.6987298 l 50,0 z\"
                transform=\"translate(6,-6)\" />
	   <text id=\"textid".$pathid."\" x=\"26%\" y=\"59%\" font-size=\"33\" font-weight=\"bold\"
                onmouseover=\"tilefading=document.getElementById('tile".$pathid."');document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');\"
                onmouseup=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');clearTimeout(buttonTimer);if (buttonDown==1){buttonDown=0;} else {buttonDown=0; updateSector('tile".$pathid."');}\"
                onmouseout=\"tilefading='';fade('bbbbbb','dddddd',document.getElementById('tile".$pathid."'));\"
		onmousedown=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#888'); buttonDown=0; buttonTimer = setTimeout(function(){buttonDown=1;document.getElementById('tile".$pathid."').setAttribute('fill', '#ECA100'); websocket.send('//mmove:".$pathid."');},500);\">
  	    		".$pathid."
           </text>
           <text id=\"txtfleetid".$pathid."\" x=\"26%\" y=\"79%\" font-size=\"21\" font-weight=\"bold\"
                onmouseover=\"tilefading=document.getElementById('tile".$pathid."');document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');\"
                onmouseup=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');clearTimeout(buttonTimer);if (buttonDown==1){buttonDown=0;} else {buttonDown=0; updateSector('tile".$pathid."'); websocket.send('//mmove:".$pathid."');}\"
                onmouseout=\"tilefading='';fade('bbbbbb','dddddd',document.getElementById('tile".$pathid."'));\"
                onmousedown=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#888'); buttonDown=0; buttonTimer = setTimeout(function(){buttonDown=1;document.getElementById('tile".$pathid."').setAttribute('fill', '#ECA100');},500);\">
	   </text>
           <text id=\"colonizedtxt".$pathid."\" x=\"26%\" y=\"29%\" font-size=\"21\" font-weight=\"bold\"
                onmouseover=\"tilefading=document.getElementById('tile".$pathid."');document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');\"
                onmouseup=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');clearTimeout(buttonTimer);if (buttonDown==1){buttonDown=0;} else {buttonDown=0; updateSector('tile".$pathid."');}\"
                onmouseout=\"tilefading='';fade('bbbbbb','dddddd',document.getElementById('tile".$pathid."'));\"
                onmousedown=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#888'); buttonDown=0; buttonTimer = setTimeout(function(){buttonDown=1;document.getElementById('tile".$pathid."').setAttribute('fill', '#ECA100'); websocket.send('//mmove:".$pathid."');},500);\">
           </text>
        </svg>
	<script>
                disableSelection(document.getElementById(\"colonizedtxt".$pathid."\"));
		disableSelection(document.getElementById(\"txtfleetid".$pathid."\"));
		disableSelection(document.getElementById(\"textid".$pathid."\"));
	</script>
	";}
function playerListBackground(){
        echo "<div id='playerlistbackgroundid' style=\"position:absolute;right:0px;top:90px;width:200px;height:220px;background-color:#333;border-top:5px solid #222;border-left:5px solid #444; border-bottom:5px solid #222;\">";
  	drawTab('playerlistbackgroundid','score','Right');
	echo "
			<b><u>
				<span id=\"playerlist\" style=\"text-align:left;width:60%;\">Player Name</span>
				<span style=\"float: right;text-align:right;width:40%;\" id=\"playerscore\">Score</span>
			</u></b>
                        <div id=\"player1name\" style=\"color:red;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player1score\"></div>
                        <div id=\"player2name\" style=\"color:blue;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player2score\"></div>
                        <div id=\"player3name\" style=\"color:green;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player3score\"></div>
                        <div id=\"player4name\" style=\"color:purple;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player4score\"></div>
                        <div id=\"player5name\" style=\"color:yellow;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player5score\"></div>
                        <div id=\"player6name\" style=\"color:cyan;width:50%;\"></div><div style=\"float:right;text-align:right;width:50%;\" id=\"player6score\"></div>
                        <div id=\"player7name\" style=\"color:pink;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player7score\"></div>
                        <div id=\"player8name\" style=\"color:orange;width:50%;\"></div><div style=\"float: right;text-align:right;width:50%;\" id=\"player8score\"></div>
                </div>
        ";
}

?>

