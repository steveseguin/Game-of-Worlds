<?php
function makeGUI(){
	playerListBackground();
	makeMiniMap();
	createControlPad();
}

function createControlPad(){
	controlPadBackground();
}

function createSector(){
	echo "
		<div id=\"mainsector\" style=\"position:absolute;top:10%;left:10%;width:61%;height:90%;padding:0px;margin:0px;background-image:url('planet1.png');background-repeat:no-repeat;\" >
		<div style=\"text-align:right\">
			<p id=\"planetname\">Planet: Fortisa</p>
			<p id=\"planetsize\">Size: Large</p>
			<p id=\"planetenviro\">Environment: Harsh (Tier 4)</p>
			<p id=\"planetunique\">Unique: Nothing</p>
		</div>
		</div>
	";
}

function makeMiniMap(){
	$x=0;
	$id=0;
	echo "<div id='minimapid' style=\"position:absolute;right:0px;bottom:0px;width:500px;height:356px;background-color:#333;border-left:5px solid #444; border-top:5px solid #222;\">";
	drawTab('minimapid','map','Right');
	while($x<14){
		$y=0;
		while($y<8){
			$id++;
			if (($x%2)==0){
				tile($x*35+2,$y*42+21,strtoupper(dechex($id)));
			}
			else{
				tile($x*35+2,$y*42,strtoupper(dechex($id)));
			}
			$y++;
		}
		$x++;
	}
	echo "</div>";
}
?>
