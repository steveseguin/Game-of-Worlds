<?php
function makeGUI(){
//	playerListBackground();
	makeMiniMap();
	createEconomy();
	createControlPad();
	resourceBar();
	turnTimeBar();
	createFleet();
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
					Alert: Our sensors located an enemy probe in sector 5B, but we successfully evaded its detection.  Unfortunately, we were unable to detect its origin.
				</p></font>
				<font color=\"#555\" size=\"1\"><i><p id=\"timeSince\" style=\"position:absolute;right:25px;bottom:-8px;\">28 seconds ago.</p></i></font>
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

function createFleet(){
	echo "
		<div style=\"position:absolute; top:40px;left:10px;\">
		<button style=\"background-color:#444;\" id=\"buttonfleet\" onclick=\"document.getElementById('buttonsector').style.backgroundColor='#666';;document.getElementById('buttonscore').style.backgroundColor='#666';document.getElementById('buttonfleet').style.backgroundColor='#444';document.getElementById('fleetdisplay').style.display='inline';document.getElementById('sectordisplay').style.display='none';;document.getElementById('economydisplay').style.display='none';\">
                        <h1>Fleet Info</h1>
                </button>
		<button style=\"background-color:#666;\" id=\"buttonsector\" onclick=\"document.getElementById('buttonsector').style.backgroundColor='#444';;document.getElementById('buttonscore').style.backgroundColor='#666';document.getElementById('buttonfleet').style.backgroundColor='#666';document.getElementById('sectordisplay').style.display='inline';document.getElementById('fleetdisplay').style.display='none';;document.getElementById('economydisplay').style.display='none';\">
                        <h1>Sector Info</h1>
		</button>";
                //<button style=\"background-color:#666;\" id=\"buttonscore\" onclick=\"document.getElementById('buttonsector').style.backgroundColor='#666';document.getElementById('buttonscore').style.backgroundColor='#444';document.getElementById('buttonfleet').style.backgroundColor='#666';document.getElementById('sectordisplay').style.display='none';document.getElementById('fleetdisplay').style.display='none';document.getElementById('economydisplay').style.display='inline';\">
                //        <h1>Production</h1>
                //</button>
	echo "	</div>
		<div id=\"fleetdisplay\" style=\"position:absolute; top:80px;left:10px;\">
		<table border=\"2px\"><tr>
        	        <td>Ship Type:</td><td><div style=\"display:inline-block;width:80px;\">Active</div></td><td><div style=\"display:inline-block;width:100px;\">Being Built</div><br /></td></tr><tr>
			<td>Corvettes:</td><td><div style=\"display:inline-block\"  id=\"f1\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa1\">N/A</div><div style=\"display:none;\" id=\"fc1\"><button>Cancel</button></div><br /></td></tr><tr>
               		<td>Destroyers:</td><td><div style=\"display:inline-block\"  id=\"f2\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa2\">N/A</div> <div style=\"display:none;\" id=\"fc2\"><button>Cancel</button></div><br /></td></tr><tr>
               		<td>Cruisers:</td><td><div style=\"display:inline-block\"  id=\"f4\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa4\">N/A</div> <div style=\"display:none;\" id=\"fc4\"><button>Cancel</button></div><br /></td></tr><tr>
                	<td>Dreadnoughts:</td><td><div style=\"display:inline-block\"  id=\"f5\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa5\">N/A</div> <div style=\"display:none;\" id=\"fc5\"><button>Cancel</button></div><br /></td></tr><tr>
                	<td>Scouts:</td><td><div style=\"display:inline-block\"  id=\"f3\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa3\">N/A</div> <div style=\"display:none;\" id=\"fc3\"><button>Cancel</button></div><br /></td></tr><tr>
                	<td>Colony Ships:</td><td><div style=\"display:inline-block\"  id=\"f6\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa6\">N/A</div> <div style=\"display:none;\" id=\"fc6\"><button>Cancel</button></div><br /></td></tr><tr>
	  	</table>
	</div>";
}
function createEconomy(){
        echo "
                <div id=\"economydisplay\" style=\"position:absolute; top:80px;left:10px;display:none;\">
                <table border=\"2px\"><tr>
                        <td>Total Metal Production:</td><td><div style=\"display:inline-block\" id=\"tmpid\">No Sector Selected</div></td></tr><tr>
                        <td>Total Crystal Production:</td><td><div style=\"display:inline-block\"  id=\"tcpid\">N/A</div></td></tr><tr>
                        <td>Total Research Production</td><td><div style=\"display:inline-block\"  id=\"trpid\">N/A</div></td></tr><tr>
                        <td>Local Metal Production:</td><td><div style=\"display:inline-block\"  id=\"lmpid\">N/A</div></td></tr><tr>
                        <td>Local Crystal Production:</td><td><div style=\"display:inline-block\"  id=\"lcpid\">N/A</div></td></tr><tr>
                        <td>Local Research Production:</td><td><div style=\"display:inline-block\"  id=\"lrpid\">N/A</div></td></tr><tr>
                        <td>Total Score:</td><td><div style=\"display:inline-block\"  id=\"scoreid\">N/A</div></td></tr>
                </table>
        </div>
        ";
}
function createSector(){
        echo "
		<div id=\"sectorimg\" style=\"z-index:-2;background-repeat:no-repeat;position:absolute;width:100%;height:100%; top:70px;left:300px;\"></div>
		<div id=\"sectordisplay\" style=\"position:absolute; top:80px;left:10px;display:none;\">
		<table border=\"2px\"><tr>
                	<td>Sector ID:</td><td><div style=\"display:inline-block\" id=\"sectorid\">No Sector Selected</div></td></tr><tr>
                	<td>Owner:</td><td><div style=\"display:inline-block\"  id=\"planetowner\">N/A</div></td></tr><tr>
                	<td>Sector Type:</td><td><div style=\"display:inline-block\"  id=\"planettype\">N/A</div></td></tr><tr>
                	<td>Metal Production:</td><td><div style=\"display:inline-block\"  id=\"metalbonus\">N/A</div></td></tr><tr>
                	<td>Crystal Production:</td><td><div style=\"display:inline-block\"  id=\"crystalbonus\">N/A</div></td></tr><tr>
                	<td>Terraform Req.:</td><td><div style=\"display:inline-block\"  id=\"terraformlvl\">N/A</div></td></tr>
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
	<div id=\"tech\" style=\"position:absolute;bottom:255px;left:0px;width:490px;display:none;\">   </div>
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
                Each weapon tech gained increases the damage of all your ship weapons by 10%.  This is particularly useful for countering the effectiveness of advanced enemy hulls. Orbital and Ground defence turrets do not gain a bonus from this tech.
		</div>
        <div id=\"tech5\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Hull Techs</b><br />
                Each hull tech gained increases the damage absorbtion of all your ships by 10%.  This is particularly useful for countering the effectiveness of advanced enemy weapons. Orbital and Ground defence turrets do not gain a bonus from this tech.
                </div>
        <div id=\"tech6\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Shield Techs</b><br />
                Each shield tech gained provides an additional 5% chance to completely deflect any hit a ship of yours takes. Base shields offer a 10% deflection chance; 20% in the case of Dreadnoughts since they have dual shields..
                </div>
        <div id=\"tech7\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Terraforming</b><br />
                Each level of terraforming tech you unlock allows you to colonize a larger variety of planets that must first be terraformed. Planets with a Zero terrforming requirement do not require any terraforming tech to be colonized.
                </div>
        <div id=\"tech8\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Spying Tech</b><br />
                Spying allows you to gain useful information on enemies when sending out probes to scan sectors controlled by the enemy.  The higher your spying tech level is relative to the enemies counter-spying tech, the more information you gather about that enemy and the more accurate that information is.
                </div>
        <div id=\"tech9\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Counter-Spying Tech</b><br />
                Counter-spying allows you to prevent incoming enemy probes from collecting useful information on sectors you control.  The higher your counter-spying skill, the less useful the information an enemy scan will gather..
                </div>

        <button id=\"t1\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:pink;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\"
			onclick=\"buyTech(1);\"	>
		<b>Metal Tech <span id=\"tt1\">1</span></b><br />
                Research: <span id=\"tc1\">4</span><br />
                +10% Metal Production
		</button>
        <button id=\"t2\"  style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:lightblue;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\"
                        onclick=\"buyTech(2);\" >
                <b>Crystal Tech <span id=\"tt2\">1</span></b><br />
                Research: <span id=\"tc2\">4</span><br />
                +10% Crystal Output
                </button>
        <button  id=\"t3\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:#CF74E2;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\"
                        onclick=\"buyTech(3);\">
                <b>Academy Tech <span id=\"tt3\">1</span></b><br />
                Research: <span id=\"tc3\">4</span><br />
                +10% Research Rate
                </button>
        <button id=\"t4\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:brown;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\"
                        onclick=\"buyTech(4);\">
                <b>Ship Weapons <span id=\"tt4\">1</span></b><br />
                Research: <span id=\"tc4\">4</span><br />
                +10% Ship Attack
                </button>
        <button id=\"t5\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:yellow;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\"
                        onclick=\"buyTech(5);\">
                <b>Ship Hulls <span id=\"tt5\">1</span></b><br />
                Research: <span id=\"tc5\">4</span><br />
                +10% Ship Hitpoints
                </button>
        <button id=\"t6\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:lightgreen;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\" onclick=\"buyTech(6);\" >
                <b>Ship Shields <span id=\"tt6\">1</span></b><br />
                Research: <span id=\"tc6\">4</span><br />
                +5% Hit Deflection
                 </button>
        <button id=\"t7\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:teal;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\" onclick=\"buyTech(7);\" >
                <b>Terraform <span id=\"tt7\">1</span></b><br />
                Research: <span id=\"tc7\">8</span><br />
                +1 Terraform Skill
                </button>
        <button id=\"t8\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:gray;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);\" onclick=\"buyTech(8);\" >
                <b>Spying <span id=\"tt8\">1</span></b><br />
                Research: <span id=\"tc8\">4</span><br />
                +1 Spying Skill
                </button>
        <button id=\"t9\" style=\"margin:8px 0;display:inline;width:158px;height:81px;background-color:gray;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(9);\" >
                <b>Counter-Spy <span id=\"tt9\">1</span></b><br />
                Research: <span id=\"tc9\">4</span><br />
                +1 Counter-Spy Skill
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
                <b>Orbital Array</b><br />
		These are offensive plantary defensives.  Each upgraded level will give your locally colonized planet a +1 attack during battles in this sector. They can only be destroyed if your sector is captured, but they also have no hitpoints, so a sector can still be easily over-run and captured without support from nearby ships or ground defenses.
                </div>
        <div id=\"build6\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Ground Defenses</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be targeted last by the enemy.  As such, ground defenses work best when used in conjunction with atleast one orbital array.
                </div>
        <div id=\"build7\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Corvette</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>
        <div id=\"build8\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Destroyer</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>
        <div id=\"build9\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Scout</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>
        <div id=\"build10\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Cruiser</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>
        <div id=\"build11\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Dreadnought</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>
        <div id=\"build12\" style=\"margin:8px 0;width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Colony Ship</b><br />
                Each level of ground defenses will increase a colonized planet's hitpoints by 1, which initially starts at 0.  Ground defenses cannot be destroyed unless the sector is captured and during battle these hitpoints will be t$
                </div>


		<button onclick=\"buyBuilding(1);\" style=\"background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build1').style.display='none';\" >
                <b>Metal Extractor <span id=\"b1\">1</span></b><br />
                Metal:  <span id=\"m1\">100</span><br />
		+100 Metal Production
                </button>
                <button onclick=\"buyBuilding(2);\" style=\"background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build2').style.display='none';\" >
                <b>Crystal Refinery <span id=\"b2\">1</span></b><br />
                Metal: <span id=\"m2\">100</span><br />
		+100 Crystal Output
                </button>
                <button onclick=\"buyBuilding(3);\" style=\"background-color:lightgreen;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build3').style.display='none';\" >
                <b>Research Academy <span id=\"b3\">1</span></b><br />
                Metal: <span id=\"m3\">100</span><br />
		+100 Research Rate
                </button>
                <button onclick=\"buyBuilding(4);\" style=\"background-color:lightblue;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build4').style.display='none';\" >

                <b>Spaceport <span id=\"b4\">1</span></b><br />
                Metal: <span id=\"m4\">100</span><br />
		+1 Build Slot
                </button>
                <button onclick=\"buyBuilding(5);\" style=\"background-color:orange;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build5').style.display='none';\" >

                <b>Orbital Array <span id=\"b5\">1</span></b><br />
                Metal: <span id=\"m5\">100</span><br />
		+1 Plantary Attack
                </button>
                <button onclick=\"buyBuilding(6);\" style=\"background-color:orange;width:158px;height:70px;\"
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'build6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('build6').style.display='none';\" >
                <b>Ground Defence <span id=\"b6\">1</span></b><br />
                Metal:  <span id=\"m6\">100</span><br />
		+1 Plantary Hitpoint
                </button>
                <button onclick=\"buyShip(1);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Corvette</b><br />
                Metal: 200<br />
		Req. 3 Build Slots
                </button>
                <button onclick=\"buyShip(2);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Destroyer</b><br />
                Metal: 500<br />
		Req. 5 Build Slots
                </button>
                <button onclick=\"buyShip(3);\" style=\"background-color:yellow;width:158px;height:70px;\">
                <b>Build Scout</b><br />
                Metal: 100<br />
		Req. 1 Build Slot
                </button>
		<button onclick=\"buyShip(4);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Cruiser</b><br />
                Metal: 500<br />
		Req. 5 Build Slots
                </button>
		<button onclick=\"buyShip(5);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Dreadnought</b><br />
                Metal: 1000<br />
		Req. 15 Build Slots
                </button>
		<button onclick=\"buyShip(6);\" style=\"background-color:yellow;width:158px;height:70px;\">
                <b>Build Colony Ship</b><br />
                Metal: 1000<br />
		Req. 7 Build Slots
                </button>
	</div>";
}
function comfleet(){

   echo "<div id=\"fleet\" style=\"position:absolute;bottom:253px;left:6px;display:none;\">
        <button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet2');\"><b>Move</b></button>
        <button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet3');\"><b>Colonize Planet</b></button>
        <button style=\"font-size:101%;height:40px;width:157px;\" class='memory2' onclick=\"makeActive(this,'memory2');showClassF('fleet1');\"><b>Ship Info</b></button>
	</div>
      <div id=\"fleetdeets\" style=\"display:none;position:absolute; bottom:10px; left:0px;\">

	<div class=\"fleet1\" style=\"display:none;\">
		<div style=\"position:absolute; bottom:150px;width:495px;\">
	        	<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship1');\"><b>Corvettes</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship2');\"><b>Cruisers</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship6');\"><b>Colony Ships</b></button>
        		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship4');\"><b>Destroyers</b></button>
       	 		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship3');\"><b>Dreadnoughts</b></button>
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
	<span style=\"position:relative;top:20px;left:20px;\"><b>Multi Move Menu</b><br />Select the nearby ships you wish to move to <i>sector <span id=\"sectorofattack\"> - </span></i></span>
	 <select id=\"shipsFromNearBy\" multiple=\"yes\" style=\"font-size:130%;height:300px;position:absolute; left:11px; bottom: 11px;  width: 385px;\">
                </select>
	<button style=\"z-index:10;position:absolute; left: 420px; bottom: 10px; width: 70px; height: 30px;\" onclick=\"document.getElementById('multiMove').style.display='none';\" >Close</button>
	<button style=\"z-index:10;position:absolute; left: 420px; bottom: 80px; width: 70px; height: 60px;\" onclick=\"sendmmf();\" >Move Ships</button>
      </div>
   ";
}

?>
