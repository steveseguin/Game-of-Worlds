<?php

function controlPadBackground(){
 	echo "
                <div id=\"controlPadGUI\" style=\"position:absolute;bottom:0;left:0;width:495px;height:333px;padding:0;margin:0;background-color:#333;border-right:5px solid #444;border-top:5px solid #222; \" >
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
                onmouseup=\"evt.target.setAttribute('fill', '#bbb');\"
                onmousedown=\"evt.target.setAttribute('fill', '#888');updateSector('tile".$pathid."');\"
		onmouseout=\"tilefading='';fade('bbbbbb','dddddd',evt.target);\"
                id=\"tile".$pathid."\"
                fill=\"#ddd\"
                stroke=\"bbb\"
                stroke-width=\"10\"
                d=\"m 97,51 -25,43.30127 -50,0 L -3,51 22,7.6987298 l 50,0 z\"
                transform=\"translate(6,-6)\" />
	   <text id=\"textid".$pathid."\" x=\"26%\" y=\"59%\" font-size=\"33\" font-weight=\"bold\"
                onmouseover=\"tilefading=document.getElementById('tile".$pathid."');document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');\"
                onmouseup=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#bbb');\"
                onmouseout=\"tilefading='';fade('bbbbbb','dddddd',document.getElementById('tile".$pathid."'));\"
		onmousedown=\"document.getElementById('tile".$pathid."').setAttribute('fill', '#888');updateSector('tile".$pathid."');return false;\">
  	    		".$pathid."
           </text>
        </svg>
	<script>
		disableSelection(document.getElementById(\"textid".$pathid."\"));
	</script>
	";}

function playerListBackground(){
        echo "<div id='playerlistbackgroundid' style=\"position:absolute;right:0px;top:0px;width:200px;height:310px;background-color:#333;border-left:5px solid #444; border-bottom:5px solid #222;\">";
  	drawTab('playerlistbackgroundid','score','Right');
	echo "
			<b><u>
				<span id=\"playerlist\" style=\"text-align:left;width:60%;float:left;\">Player Name</span>
				<span style=\"float: right;text-align:right;width:40%;\" id=\"playerscore\">Score</span>
			</u></b>
                        <span id=\"player1name\" style=\"color:red;text-align:left;width:50%;float:left;\">Dr.Awesome</span><span style=\"float: right;text-align:right;width:50%;\" id=\"player1score\">61273</span>
                        <span id=\"player2name\" style=\"color:blue;text-align:left;width:50%;float:left;\">Frankenpoof</span><span style=\"float: right;text-align:right;width:50%;\" id=\"player2score\">58713</span>
                        <span id=\"player3name\" style=\"color:green;text-align:left;width:50%;float:left;\">Xyster</span><span style=\"float: right;text-align:right;width:50%;\" id=\"player3score\">48134</span>
                        <span id=\"player4name\" style=\"color:purple;text-align:left;width:50%;float:left;\">killer02</span><span style=\"float: right;text-align:right;width:50%;\" id=\"player4score\">42164</span>
                        <span id=\"player5name\" style=\"color:yellow;text-align:left;width:50%;float:left;\">Xerxies</span><span style=\"float: right;text-align:right;width:50%;\" id=\"player5score\">12623</span>
                        <span id=\"player6name\" style=\"color:cyan;text-align:left;width:50%;float:left;text-decoration:line-through;\">Solisman</span><span style=\"float:right;text-align:right;width:50%;\" id=\"player6score\">6231</span>
                        <span id=\"player7name\" style=\"color:pink;text-align:left;width:50%;float:left;\"></span><span style=\"float: right;text-align:right;width:50%;\" id=\"player7score\"></span>
                        <span id=\"player8name\" style=\"color:orange;text-align:left;width:50%;float:left;\"></span><span style=\"float: right;text-align:right;width:50%;\" id=\"player8score\"></span>
                </div>
        ";
}

?>

