<?php
function makeGUI(){
//	playerListBackground();
	makeMiniMap();
	createControlPad();
	resourceBar();
	turnTimeBar();
	createInfo();
	createAvatar();
	multiAttack();
}
function createAvatar(){
	echo "
		<div id=\"avatarbox\" style=\"position:absolute;right:0;bottom:359px;width:200px;height:180px;\">
			<button style=\"position:absolute;right:1px;top:15px;width:25px;height:40px;\" onclick=\"showChatHistory();\"><h1>^</h1></button>
			<button style=\"position:absolute;right:1px;top:75px;width:25px;height:40px;\" onclick=\"chatID=0;showChatHistory();\"><h2>v</h2></button>
			<div id=\"empireupdates\" style=\"padding:5px 15px;position:absolute;right:180px;bottom:62px;width:320px;background-color:#C2B49E;-moz-border-radius: 15px;border-radius: 15px;\">
				<img style=\"position:absolute;right:-15px;top:15px;\" src=\"bubblebox.png\" />
				<font color=\"black\" size=\"2\"><p id=\"log\">
					Welcome to Galaxy Conquest, Emperor. <br />The game is yet to begin.  Please wait for all intended players to join before clicking 'Game Start'.
				</p></font>
				<font color=\"#555\" size=\"1\"><i><p id=\"timeSince\" style=\"position:absolute;right:25px;bottom:-8px;\">Have Fun!</p></i></font>
			</div>
			<img style=\"z-index:-1;position:absolute;right:37px;top:0px;\" src=\"avatar1.jpg\" /><br />
			<img style=\"z-index:-1;position:absolute;right:0;top:126px;width:525px;height:59px;\" src=\"topofmap.png\" />
			<img style=\"z-index:-1;position:absolute;right:500px;top:184px;width:40px;\" src=\"mapleftside.png\" />
			<img style=\"z-index:-1;position:absolute;right:40px;top:140px;\" src=\"waveform.gif\" />
		</div>
	";
}
function createControlPad(){
	controlPadBackground();
}

function createInfo(){
	echo "
		<div id=\"fleetinfo\" style=\"position:absolute; bottom:10px;left:10px; display:none;\">
		empire overview goes here
	</div>";
}
function createSector(){
        echo 	"
		<div id=\"sectorimg\" style=\"z-index:-2;background-repeat:no-repeat;position:absolute;width:100%;height:100%; top:70px;left:300px;\"></div>
		<div id=\"sectordisplay\" style=\"position:absolute; top:80px;left:270px;display:block;\">
		<table border=\"0px\"><tr>
                	<td>Sector ID:</td><td><div style=\"display:inline-block\" id=\"sectorid\">N/A</div></td></tr><tr>
                	<td>Owner:</td><td><div style=\"display:inline-block\"  id=\"planetowner\">N/A</div></td></tr><tr>
                	<td>Sector Type:</td><td><div style=\"display:inline-block\"  id=\"planettype\">N/A</div></td></tr><tr>
                	<td>Metal Production:</td><td><div style=\"display:inline-block\"  id=\"metalbonus\">N/A</div></td></tr><tr>
                	<td>Crystal Production:</td><td><div style=\"display:inline-block\"  id=\"crystalbonus\">N/A</div></td></tr><tr>
                	<td>Terraform Req.:</td><td><div style=\"display:inline-block\"  id=\"terraformlvl\">N/A</div></td></tr>
                </table>
		<br />
		<table border=\"0px\"><tr>
                        <td>Ship Type:</td><td><div style=\"display:inline-block;width:50px;\">Active</div></td><td><div style=\"display:inline-block;width:100px;\">Being Built</div><br /></td></tr><tr>
                        <td>Frigates:</td><td><div style=\"display:inline-block\"  id=\"f1\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa1\">N/A</div><div style=\"display:none;\" id=\"fc1\"><button>Cancel</button></div><br /></td></tr><tr>
                        <td>Destroyers:</td><td><div style=\"display:inline-block\"  id=\"f2\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa2\">N/A</div> <div style=\"display:none;\" id=\"fc2\"><button>Cancel</button></div><br /></td></tr><tr>
                        <td>Cruisers:</td><td><div style=\"display:inline-block\"  id=\"f4\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa4\">N/A</div> <div style=\"display:none;\" id=\"fc4\"><button>Cancel</button></div><br /></td></tr><tr>
                        <td>Battleships:</td><td><div style=\"display:inline-block\"  id=\"f5\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa5\">N/A</div> <div style=\"display:none;\" id=\"fc5\"><button>Cancel</button></div><br /></td></tr><tr>
                        <td>Scouts:</td><td><div style=\"display:inline-block\"  id=\"f3\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa3\">N/A</div> <div style=\"display:none;\" id=\"fc3\"><button>Cancel</button></div><br /></td></tr><tr>
                        <td>Colony Ships:</td><td><div style=\"display:inline-block\"  id=\"f6\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa6\">N/A</div> <div style=\"display:none;\" id=\"fc6\"><button>Cancel</button></div><br /></td></tr><tr>
                </table>


        </div>
	";
}

function makeMiniMap(){
	$x=0;
	$id=0;
	echo "<div id='minimapid' style=\"position:absolute;right:0px;bottom:0px;width:500px;height:356px;background-color:#5C605A\">";
	//drawTab('minimapid','map','Right');
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

function turnTimeBar(){
	echo "<div style=\"background-color:#333;position:absolute;right:0;top:0;width:300px;border-bottom:5px solid #222;border-left:5px solid #444;height:90px;\">
	<center>
		<br />
		Game mode: <i>Large Conquest</i>
		<button style=\"padding:5px;margin:5px\" onclick=\"nextTurn();\"><b id=\"nextTurnText\">Game Start</b></button>begins in <b id='turnRedFlashWhenLow'> ...</b>
	</center></div>";
}

function resourceBar(){
	echo "<div style=\"background-color:#333;position:absolute;left:0;top:0;width:495px;border-bottom:5px solid #444;border-right:5px solid #444;height:30px;border-radius: 0 0 15px 0;\">
	<div style=\"display:inline-block;width: 25px; height: 25px; overflow: hidden;\"><img src=\"resources.png\" style=\"position:relative;left:-25px;\"  alt=\"Metal\"/></div><span id=\"metalresource\"> 0 Metal,</span>
	<div style=\"display:inline-block;width: 25px; height: 25px; overflow: hidden;\"><img src=\"resources.png\" style=\"position:relative;left:0;\"  alt=\"Crystal\"/></div><span id=\"crystalresource\"> 0 Crystal,</span>
	<div style=\"display:inline-block;width: 25px; height: 25px; overflow: hidden;\"><img src=\"resources.png\" style=\"position:relative;left:-50px;\"  alt=\"Research\"/></div><span id=\"researchresource\"> 0 Research</span>
	</div>";
}
function comtech(){
	echo "
	<div id=\"techtree\" style=\"display:none;position:absolute; bottom:5px; left:0px;\">

	<div id=\"tech1\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
		<b>Metal Production</b><br />
		Increase the production rate of metal on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech2\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
		<b>Crystal Techs</b><br />
                Increase the output rate of crystal on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech3\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Research Techs</b><br />
                Increase the output rate of research on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech4\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
	 <b>Weaponary Techs</b><br />
                Each weapon tech gained increases the damage of all your ship weapons by 10%.  This is particularly useful for countering the effectiveness of advanced enemy hulls. Orbital defence turrets do not gain a bonus from this tech.
		</div>
        <div id=\"tech5\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Hull Techs</b><br />
                Each hull tech gained increases the damage absorbtion of all your ships by 10%.  This is particularly useful for countering the effectiveness of advanced enemy weapons. Orbital turrets do not gain a bonus from this tech.
                </div>
        <div id=\"tech6\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Shield Techs</b><br />
                Each shield tech gained provides an additional 5% chance to completely deflect any hit a ship of yours takes. Base shields offer a 10% deflection chance; effectively 19% in the case of Battleships since they have dual shields.
                </div>
        <div id=\"tech7\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Terraforming</b><br />
                Each level of terraforming tech you unlock allows you to colonize a larger variety of planets that must first be terraformed. Planets with a Zero terrforming requirement do not require any terraforming tech to be colonized.
                </div>
        <div id=\"tech8\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Probe Sensors</b><br />
                This tech allows you to more likely gain useful information from enemies when sending out probes to scan sectors controlled by the enemy.  The higher your probe's sensor tech is relative to the enemy's wave dampening tech, the more information you gather about that enemy and the more accurate that information is.  Fail this check badly enough though and you may even give away your position to the enemy.
                </div>
        <div id=\"tech9\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Electronic Wave Dampening</b><br />
                Counter-spying allows you to prevent incoming enemy probes from collecting useful information on sectors you control.  The higher your relative counter-spying skill is to your enemy's spying skill, the less useful the information an enemy scan will gather.
                </div>

        <button id=\"t1\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:pink;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
			onclick=\"buyTech(1);\"	>
		<b>Metal Tech <span id=\"ttt1\">0</span></b><br />
                Research: <span id=\"tc1\">100</span><br />
                +10% Metal Production
		<font size='1em'><br />Next Level: <span id=\"tt1\">1</span> of 15</font>
		</button>
        <button id=\"t2\"  style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:lightblue;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\"
                        onclick=\"buyTech(2);\" >
                <b>Crystal Tech <span id=\"ttt2\">0</span></b><br />
                Research: <span id=\"tc2\">100</span><br />
                +10% Crystal Output
                <font size='1em'><br />Next Level: <span id=\"tt2\">1</span> of 15</font>
                </button>
        <button  id=\"t3\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:#CF74E2;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\"
                        onclick=\"buyTech(3);\">
                <b>Academy Tech <span id=\"ttt3\">0</span></b><br />
                Research: <span id=\"tc3\">100</span><br />
                +10% Research Rate
                <font size='1em'><br />Next Level: <span id=\"tt3\">1</span> of 15</font>
                </button>
        <button id=\"t4\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:brown;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\"
                        onclick=\"buyTech(4);\">
                <b>Ship Weapons <span id=\"ttt4\">0</span></b><br />
                Research: <span id=\"tc4\">100</span><br />
                +10% Ship Attack
                <font size='1em'><br />Next Level: <span id=\"tt4\">1</span> of 15</font>
                </button>
        <button id=\"t5\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:yellow;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\"
                        onclick=\"buyTech(5);\">
                <b>Ship Hulls <span id=\"ttt5\">0</span></b><br />
                Research: <span id=\"tc5\">100</span><br />
                +10% Ship Hitpoints
                <font size='1em'><br />Next Level: <span id=\"tt5\">1</span> of 15</font>
                </button>
        <button id=\"t6\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:lightgreen;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\"
			onclick=\"buyTech(6);\" >
                <b>Ship Shields <span id=\"ttt6\">0</span></b><br />
                Research: <span id=\"tc6\">100</span><br />
                +5% Hit Deflection
                <font size='1em'><br />Next Level: <span id=\"tt6\">1</span> of 15</font>
                 </button>
        <button id=\"t7\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:teal;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';
			\" onclick=\"buyTech(7);\" >
                <b>Terraform <span id=\"ttt7\">0</span></b><br />
                Research: <span id=\"tc7\">100</span><br />
                +1 Terraform Skill
                <font size='1em'><br />Next Level: <span id=\"tt7\">1</span> of 8</font>
                </button>
        <button id=\"t8\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:gray;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(8);\" >
                <b>Probe Sensors <span id=\"ttt8\">0</span></b><br />
                Research: <span id=\"tc8\">100</span><br />
                +1 Spying Skill
                <font size='1em'><br />Next Level: <span id=\"tt8\">1</span></font>
                </button>
        <button id=\"t9\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:gray;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(9);\" >
                <b>Wave Dampening <span id=\"ttt9\">0</span></b><br />
                Research: <span id=\"tc9\">100</span><br />
                +1 Counter-Spy Skill
                <font size='1em'><br />Next Level: <span id=\"tt9\">1</span></font>
                </button>

	</div>";
}
function combuild(){
	echo "<div id=\"build\" style=\"position:absolute;bottom:10px;left:0px;display:none;\">

        <div id=\"build1\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Metal Extractor</b><br />
                Increases the production of metal on the local colonized planet by 100 for each level of this building.  If you lose control of this sector, you will also lose this building.  Metal is the primary resource used to build ships, defences, and buildings.  Your initial homeworld starts with a tier 1 metal extractor.
                </div>
        <div id=\"build2\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Crystal Refinery</b><br />
		Increases the production of crystal on the local colonized planet by 100 for each level of this building.  If you lose control of this sector, you will also lose this building.  Crystal is the primary resource needed for ship movement, probes and spying.  Defensive players may not require much of this resource.
                </div>
        <div id=\"build3\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Research Academy</b><br />
                Increases the research output on the local colonized planet by  100 for each level of this building.  If you lose control of this sector, you will also lose this building.  Research is the primary resource needed to upgrade technology, which is required to terraform certain planents, increase resource production, and to advance your spying abilities.
                </div>
        <div id=\"build4\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Spaceport</b><br />
                Each colonized planet you control can have a Spaceport built on it.  These buildings allow you to build ships, however Spaceports have limited docking space to build ships with.  The higher the tier of Spaceport you have on a planet however, the larger the ship you can build and the more of them you can build.  It takes a full turn to build ships at any Spaceport and ships being built will be lost if you lose control of the sector.
                </div>
        <div id=\"build5\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Orbital Turret</b><br />
		These are offensive plantary defensives.  Each upgraded level will give your locally colonized planet a +1 attack and +1 hitpoint, but offer no plantary shielding. They can only be destroyed if your sector is captured and cannot be moved to another sector.  They are usually last to be targeted in a battle.
                </div>
        <div id=\"build6\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Warp Gate</b><br />
                Warp gates allow any ships you control to move to this sector as if it were just one movement away. Warp gates are not included in battles and can only be destroyed when your sector is captured.  Also, they can only be built near a colonized planet that you control.
                </div>


		<button id=\"bb1\" onclick=\"buyBuilding(1);\" style=\"margin:8px 0;background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build1').style.display='none';\" >
                <b>Metal Extractor <span id=\"bbb1\">1</span></b><br />
		Metal Cost: <span id=\"m1\">100</span><br />
		+100 Metal Production
		<br /><font size='1em'>Next Level: <span id=\"b1\">2</span></font>
                </button>
                <button id=\"bb2\" onclick=\"buyBuilding(2);\" style=\"margin:8px 0;background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build2').style.display='none';\" >
                <b>Crystal Refinery <span id=\"bbb2\">0</span></b><br />
                Metal Cost: <span id=\"m2\">100</span><br />
		+100 Crystal Output
		<br /><font size='1em'>Next Level: <span id=\"b2\">1</span></font>
                </button>
                <button id=\"bb3\" onclick=\"buyBuilding(3);\" style=\"margin:8px 0;background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build3').style.display='none';\" >
                <b>Research Academy <span id=\"bbb3\">0</span></b><br />
                Metal Cost: <span id=\"m3\">100</span><br />
		+100 Research Rate
		<br /><font size='1em'>Next Level: <span id=\"b3\">1</span></font>
                </button>
                <button onclick=\"buyBuilding(4);\" style=\"margin:8px 0;background-color:lightblue;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build4').style.display='none';\" >

                <b>Spaceport <span id=\"bbb4\">0</span></b><br />
                Metal Cost: <span id=\"m4\">100</span><br />
		+1 Build Slot
		<br /><font size='1em'>Next Level: <span id=\"b4\">1</span></font>
                </button>
                <button onclick=\"buyBuilding(5);\" style=\"margin:8px 0;background-color:orange;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build5').style.display='none';\" >

                <b>Starbase <span id=\"bbb5\">1</span></b><br />
                Metal Cost: <span id=\"m5\">600</span><br />
		A:+2,H:+2,S:+1 
		<br /><font size='1em'>Next Level: <span id=\"b5\">1</span></font>
                </button>
                <button id=\"bb6\" onclick=\"buyBuilding(6);\" style=\"margin:8px 0;background-color:teal;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build6').style.display='none';\" >
                <b>Warp Gate<span id=\"b6\"></span></b><br />
                Metal Cost:  <span id=\"m6\">2000</span><br />
		1 Move To Here<br /> 
		<font size='1em'>Required to Unlock Carriers</font>
                </button>
	</div>";
}

function comcolonize(){
 echo "<div id=\"colonizediv\" style=\"position:absolute;bottom:53px;left:6px;display:none;\">
                <b><button style=\"padding:20px;\" onclick=\"websocket.send('//colonize');\">Attempt to Colonize Sector</button></b><br /><br />
                To colonize a sector, the following must be met:<br /><br />-You need a Colony Ship in the sector<br /><br />-You need a terraform tech level equal or greater to the sector's terraform requirement<br /><br />-The sector must contain a p$
        </div>";
}
function comfleet(){

//<button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet2');\"><b>Move</b></button>
  //     <button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet3');\"><b>Colonize Planet</b></button>
    //   <button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet1');\"><b>Ship Info</b></button>

 echo "<div id=\"fleet\" style=\"position:absolute;bottom:8px;left:6px;display:none;\">
        <div id=\"build7\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Frigate</b><br />
                Frigates are cheap all-purpose ships. They have 1 attack, 1 hitpoint of hull and 1 shield with a base deflection of 10%.  They require 200 crystal to move however, making large fleets of them costly to move. They are usually the first $
                </div>
        <div id=\"build8\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Destroyer</b><br />
                Destroyers are powerful ships as they have 2 attacks, 2 hitpoints of hull and 1 shield with a base deflection of 10%.  While they do cost 300 crystal to move, fewer are needed in a fleet to overwhelm the enemy.
                </div>
        <div id=\"build9\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Scout</b><br />
                Scouts do not carry weapons and provide little help in a battle. They do not have shields and have just 1 hitpoint of hull, yet with a movement cost of only 100 crystal, they make great ships for early exploration.
                </div>
        <div id=\"build10\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Cruiser</b><br />
                Cruisers are not as effective in battle as destroyers are, as they only have 1 attack, but with 2 hitpoints of hull, a shield and a movement cost of just 200 crystal, large fleets can be powerful.
                </div>
        <div id=\"build11\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Battleship</b><br />
                Battleships are a costly ship to build, but with double shields, triple hulls and a triple attack, they live up to their name.  The movement cost is 300 crystal.  The double shields have an effective base deflection of 19% and gain sig$
                </div>
        <div id=\"build12\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Colony Ship</b><br />
                Colony Ships are required to colonize and terraform planets.  The ship needs to be moved to the sector that contains the planet in question and will be removed from game when used once.  They have a movement cost of 200 crystal, have 1 $
                </div>
        <div id=\"build13\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Colony Ship</b><br />
                Colony Ships are required to colonize and terraform planets.  The ship needs to be moved to the sector that contains the planet in question and will be removed from game when used once.  They have a movement cost of 200 crystal, have 1 $
                </div>
        <div id=\"build14\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Colony Ship</b><br />
                Colony Ships are required to colonize and terraform planets.  The ship needs to be moved to the sector that contains the planet in question and will be removed from game when used once.  They have a movement cost of 200 crystal, have 1 $
                </div>
        <div id=\"build15\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Colony Ship</b><br />
                Colony Ships are required to colonize and terraform planets.  The ship needs to be moved to the sector that contains the planet in question and will be removed from game when used once.  They have a movement cost of 200 crystal, have 1 $
                </div>





                <button onclick=\"buyShip(1);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build7').style.display='none';\" >
                <b>Build Frigate</b><br />
                Metal Cost: 300<br />
                Req. 3 Build Slots<br /><font size='1em'>A:1,H:1,S:1,M:200</font>
                </button>
                <button onclick=\"buyShip(2);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build8').style.display='none';\" >
                <b>Build Destroyer</b><br />
                Metal Cost: 500<br />
                Req. 5 Build Slots<br /><font size='1em'>A:2,H:2,S:1,M:200</font>
                </button>
                <button onclick=\"buyShip(3);\" style=\"margin:8px 0;background-color:yellow;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build9').style.display='none';\" >
                <b>Build Scout</b><br />
                Metal Cost: 200<br />
                Req. 1 Build Slot<br /><font size='1em'>A:0,H:1,S:0,M:100</font>
                </button>
                <button onclick=\"buyShip(4);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build10\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build10').style.display='none';\" >
                <b>Build Cruiser</b><br />
                Metal Cost: 900<br />
                Req. 8 Build Slots<br /><font size='1em'>A:3,H:3,S:2,M:200</font>
                </button>
                <button onclick=\"buyShip(5);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build11\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build11').style.display='none';\" >
                <b>Build Battleship</b><br />
                Metal Cost: 1600<br />
                Req. 12 Build Slots<br /><font size='1em'>A:6,H:5,S:3,M:300</font>
                </button>
                <button onclick=\"buyShip(6);\" style=\"margin:8px 0;background-color:yellow;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build12\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build12').style.display='none';\" >
                <b>Build Colony Ship</b><br />
                Metal Cost: 1000<br />
                Req. 7 Build Slots<br /><font size='1em'>A:0,H:1,S:1,M:200</font>
                </button>
                <button onclick=\"buyShip(7);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build13\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build13').style.display='none';\" >
                <b>Build Dreadnought</b><br />
                Metal Cost: 4400<br />
                Req. 20 Build Slots<br /><font size='1em'>A:16,H:16,S:5,M:500</font>
                </button>
                <button onclick=\"buyShip(8);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build14\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build14').style.display='none';\" >
                <b>Build Intruder</b><br />
                Metal Cost: 1200<br />
                Req. 5 Build Slots<br /><font size='1em'>A:8,H:1,S:10,M:200</font>
                </button>
                <button onclick=\"buyShip(9);\" style=\"margin:8px 0;background-color:pink;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build15\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build15').style.display='none';\" >
                <b>Build Carrier</b><br />
                Metal Cost: 3000<br />
                Req. 15 Build Slots<br /><font size='1em'>A:4,H:8,S:3,M:300,WarpGate</font>
                </button>



	<div class=\"fleet1\" style=\"display:none;\">
		<div style=\"position:absolute; bottom:150px;width:495px;\">
	        	<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship1');\"><b>Frigates</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship2');\"><b>Cruisers</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship6');\"><b>Colony Ships</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship4');\"><b>Destroyers</b></button>
       	 		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship3');\"><b>Battleships</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship5');\"><b>Scouts</b></button>
		</div>
		<div id='ship1' style=\"display:none;background-image:url('interceptor.png');position:absolute;width:500px;bottom:3px;left:100px;height:135px;background-repeat : no-repeat;\">
			<button style=\"background-color:pink;height:30px;width:127px;position:relative;top:52px;left:-100px;opacity:0.7;\">
				<b>Weapon x 1</b>
			</button>
			<button style=\"background-color:yellow;height:30px;width:127px;position:relative;top:35px;left:-100px;opacity:0.7;\">
                	        <b>Hull x 1</b>
                	</button>
			<button style=\"background-color:lightblue;height:30px;width:127px;position:relative;top:52px;left:-100px;opacity:0.7;\">
                	        <b>Movement x 1</b>
                	</button>
			<button style=\"background-color:lightgreen;height:30px;width:127px;position:relative;top:40px;left:-100px;opacity:0.7;\">
                	        <b>Shields x 1</b>
                	</button>
		</div>
                <div id='ship2' style=\"display:none;background-image:url('cruiser.png');position:absolute;width:500px;bottom:-35px;left:20px;height:182px;background-repeat : no-repeat;\">
                        <button style=\"background-color:pink;height:30px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Weapon x 1</b>
                        </button>
                        <button style=\"background-color:yellow;height:45px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Hull x 2</b>
                        </button>
                        <button style=\"background-color:lightblue;height:45px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Movement x 2</b>
                        </button>
                        <button style=\"background-color:lightgreen;height:30px;width:127px;position:relative;top:45px;left:113px;opacity:0.8;\">
                                <b>Shields x 1</b>
                        </button>
                </div>
                <div id='ship3' style=\"display:none;background-image:url('dreadnaught.png');position:absolute;width:500px;bottom:-10px;left:20px;height:160px;background-repeat : no-repeat;\">
                        <button style=\"background-color:pink;height:60px;width:127px;position:relative;top:50px;left:-20px;opacity:0.8;\">
                                <b>Weapon x 3</b>
                        </button>
                        <button style=\"background-color:yellow;height:60px;width:127px;position:relative;top:26px;left:-20px;opacity:0.8;\">
                                <b>Hull x 3</b>
                        </button>
                        <button style=\"background-color:lightblue;height:60px;width:127px;position:relative;top:50px;left:-20px;opacity:0.8;\">
                                <b>Movement x 3</b>
                        </button>
                        <button style=\"background-color:lightgreen;height:45px;width:127px;position:relative;top:29px;left:-20px;opacity:0.8;\">
                                <b>Shields x 2</b>
                        </button>
                </div>
                <div id='ship4' style=\"display:none;background-image:url('ship.png');position:absolute;width:500px;bottom:13px;left:20px;height:115px;background-repeat : no-repeat;\">
                        <button style=\"background-color:pink;height:45px;width:127px;position:relative;top:35px;left:-20px;opacity:0.8;\">
                                <b>Weapon x 2</b>
                        </button>
                        <button style=\"background-color:yellow;height:45px;width:127px;position:relative;top:10px;left:-20px;opacity:0.8;\">
                                <b>Hull x 2</b>
                        </button>
                        <button style=\"background-color:lightblue;height:60px;width:127px;position:relative;top:35px;left:-20px;opacity:0.8;\">
                                <b>Movement x 3</b>
                        </button>
                        <button style=\"background-color:lightgreen;height:30px;width:127px;position:relative;top:5px;left:-20px;opacity:0.8;\">
                                <b>Shields x 1</b>
                        </button>
                </div>
                <div id='ship5' style=\"display:none;background-image:url('probe.png');position:absolute;width:500px;bottom:13px;left:120px;height:115px;background-repeat : no-repeat;\">
                        <button style=\"background-color:yellow;height:30px;width:127px;position:relative;top:15px;left:13px;opacity:0.8;\">
                                <b>Hull x 1</b>
                        </button>
                        <button style=\"background-color:lightblue;height:30px;width:127px;position:relative;top:50px;left:-120px;opacity:0.8;\">
                                <b>Movement x 1</b>
                        </button>
                </div>
                <div id='ship6' style=\"display:none;background-image:url('colonyship.png');position:absolute;width:500px;bottom:13px;left:2px;height:115px;background-repeat : no-repeat;\">
                        <button style=\"background-color:lightgreen;height:30px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Shields x 1</b>
                        </button>
                        <button style=\"background-color:yellow;height:30px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Hull x 1</b>
                        </button>
                        <button style=\"background-color:lightblue;height:45px;width:127px;position:relative;top:40px;left:-20px;opacity:0.8;\">
                                <b>Movement x 2</b>
                        </button>
                </div>
	</div>
        <div class=\"fleet2\" style=\"display:none;\">
		<div style=\"position:absolute;bottom:210px;width:140px;left:5px;\"><b>Ships in Sector</b></div>
		<div style=\"position:absolute;bottom:210px;width:140px;left:281px;\"><b>Ships to Send</b></div>

                <button onclick=\"popupSelectDestination();\" style=\"font-size:110%;position:absolute;bottom:-1px;width:275px;left:203px;height:45px;\">Select Destination and Send</button>

		<button style=\"font-size:200%;position:absolute;bottom:127px;left:220px;width:45px;height:45px;\" onclick=\"moveShips(shipsFrom,shipsTo);\">></button>
		<button style=\"font-size:200%;position:absolute;bottom:77px;left:220px;width:45px;height:45px;\" onclick=\"moveShips(shipsTo,shipsFrom);\"><</button>

		<select id=\"shipsFrom\" multiple=\"yes\" style=\"font-size:130%;height:198px;position:absolute; left:11px; bottom: 0px;  width: 185px;\">
		</select>
		<select id=\"shipsTo\" multiple=\"yes\" style=\"font-size:130%;height:145px;position:absolute; left:289px; bottom: 53px; width: 185px;\">
                </select>
	</div>
        <div class=\"fleet3\" style=\"position:absolute; bottom:130px;left: 0px;display:none;width:495px;height:100px;\">
		<b><button style=\"padding:20px;\" onclick=\"websocket.send('//colonize');\">Attempt to Colonize Sector</button></b><br /><br />
		To colonize a sector, the following must be met:<br /><br />-You need a Colony Ship in the sector<br /><br />-You need a terraform tech level equal or greater to the sector's terraform requirement<br /><br />-The sector must contain a planet
	</div>
      </div>
   ";
}
function multiAttack(){
   echo "
      <div id=\"multiMove\" style=\"z-index:10;position:absolute; display:none; left: 10px; bottom: 10px; width: 500px; height: 400px; background-color:#555; border: 5px solid #111;\">
	<span style=\"position:relative;top:20px;left:20px;\"><b>Fleet Move Menu</b><br />Select the nearby ships you wish to move to <i>sector <span id=\"sectorofattack\"> - </span></i></span>
	 <select id=\"shipsFromNearBy\" multiple=\"yes\" style=\"font-size:130%;height:300px;position:absolute; left:11px; bottom: 11px;  width: 385px;\">
                </select>
	<button style=\"z-index:10;position:absolute; left: 420px; bottom: 10px; width: 70px; height: 30px;\" onclick=\"document.getElementById('multiMove').style.display='none';\" >Close</button>
	<button style=\"z-index:10;position:absolute; left: 420px; bottom: 80px; width: 70px; height: 60px;\" onclick=\"sendmmf();\" >Move Selected Ships</button>
        <button style=\"z-index:10;position:absolute; left: 420px; bottom: 150px; width: 70px; height: 60px;\" onclick=\"sendallmm();\" >Move All Ships</button>
        <button style=\"z-index:10;position:absolute; left: 420px; bottom: 220px; width: 70px; height: 60px;\" onclick=\"sendaamm();\" >Move Attack Ships</button>
      </div>
   ";
}

?>
