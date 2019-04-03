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
}
function createAvatar(){
	echo "
		<div id=\"avatarbox\" style=\"z-index:-1;position:absolute;right:0;bottom:359px;width:200px;height:180px;\">
			<button style=\"position:absolute;right:1px;top:15px;width:25px;height:40px;\" onclick=\"showChatHistory();\"><h1>^</h1></button>
			<button style=\"position:absolute;right:1px;top:75px;width:25px;height:40px;\" onclick=\"chatID=1;showChatHistory();\"><h2>v</h2></button>
			<div id=\"empireupdates\" style=\"padding:5px 15px;position:absolute;right:180px;bottom:62px;width:320px;background-color:#C2B49E;-moz-border-radius: 15px;border-radius: 15px;\">
				<img style=\"position:absolute;right:-15px;top:15px;\" src=\"bubblebox.png\" />
				<font color=\"black\" size=\"2\"><p id=\"log\">
					Alert: Our sensors located an enemy probe in sector 5B, but we successfully evaded its detection.  Unfortunately, we were unable to detect its origin.
				</p></font>
				<font color=\"#555\" size=\"1\"><i><p id=\"timeSince\" style=\"position:absolute;right:25px;bottom:-8px;\">28 seconds ago.</p></i></font>
			</div>
			<img style=\"position:absolute;right:37px;top:0px;\" src=\"avatar1.jpg\" /><br />
			<img style=\"position:absolute;right:0;top:126px;width:525px;height:59px;\" src=\"topofmap.png\" />
			<img style=\"position:absolute;right:500px;top:184px;width:40px;\" src=\"mapleftside.png\" />
			<img style=\"position:absolute;right:40px;top:140px;\" src=\"waveform.gif\" />
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
		</button>
                <button style=\"background-color:#666;\" id=\"buttonscore\" onclick=\"document.getElementById('buttonsector').style.backgroundColor='#666';document.getElementById('buttonscore').style.backgroundColor='#444';document.getElementById('buttonfleet').style.backgroundColor='#666';document.getElementById('sectordisplay').style.display='none';document.getElementById('fleetdisplay').style.display='none';document.getElementById('economydisplay').style.display='inline';\">
                        <h1>Production</h1>
                </button>
		</div>
		<div id=\"fleetdisplay\" style=\"position:absolute; top:80px;left:10px;\">
		<table border=\"2px\"><tr>
        	        <td>Ship Type:</td><td><div style=\"display:inline-block;width:80px;\">Active</div></td><td><div style=\"display:inline-block;width:100px;\">Being Built</div><br /></td></tr><tr>
			<td>Corvettes:</td><td><div style=\"display:inline-block\"  id=\"f1\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa1\">N/A</div><div style=\"display:none;\" id=\"fc1\"><button>Cancel</button></div><br /></td></tr><tr>
               		<td>Destroyers:</td><td><div style=\"display:inline-block\"  id=\"f2\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa2\">N/A</div> <div style=\"display:none;\" id=\"fc2\"><button>Cancel</button></div><br /></td></tr><tr>
               		<td>Cruisers:</td><td><div style=\"display:inline-block\"  id=\"f4\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa4\">N/A</div> <div style=\"display:none;\" id=\"fc4\"><button>Cancel</button></div><br /></td></tr><tr>
                	<td>Dreadnaughts:</td><td><div style=\"display:inline-block\"  id=\"f5\">N/A</div></td><td><div style=\"display:inline-block\"  id=\"fa5\">N/A</div> <div style=\"display:none;\" id=\"fc5\"><button>Cancel</button></div><br /></td></tr><tr>
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
		<div id=\"sectorimg\" style=\"background-repeat:no-repeat;position:absolute;width:480px;height:480px; top:47px;left:350px;\"></div>
		<div id=\"sectordisplay\" style=\"position:absolute; top:80px;left:10px;display:none;\">
		<table border=\"2px\"><tr>
                	<td>Sector ID:</td><td><div style=\"display:inline-block\" id=\"sectorid\">No Sector Selected</div></td></tr><tr>
                	<td>Owner:</td><td><div style=\"display:inline-block\"  id=\"planetowner\">N/A</div></td></tr><tr>
                	<td>Sector Type:</td><td><div style=\"display:inline-block\"  id=\"planettype\">N/A</div></td></tr><tr>
                	<td>Artifact:</td><td><div style=\"display:inline-block\"  id=\"artifact\">N/A</div></td></tr><tr>
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
	echo "<div id=\"tech\" style=\"position:absolute;bottom:255px;left:0px;width:490px;display:none;\">
	<button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier1');\">Tier 1</button>
	<button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier2');\">Tier 2</button>
	<button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier3');\">Tier 3</button>
	<button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier4');\">Tier 4</button>
        <button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier5');\">Tier 5</button>
        <button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier6');\">Tier 6</button>
        <button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier7');\">Tier 7</button>
        <button class='memory' style=\"height:40px;width:53px;\" onclick=\"makeActive(this,'memory');showClass('tier8');\">Tier 8</button>
	</div>
	<div id=\"techtree\" style=\"display:none;position:absolute; bottom:5px; left:0px;\">

	<div id=\"tech1\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
		<b>Metal Production</b><br />
		Increase the production rate of metal on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech2\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
		<b>Crystal Techs</b><br />
                Increase the output rate of crystal on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech3\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
                <b>Research Techs</b><br />
                Increase the output rate of research on all planets you control by 10% for each level of this technology gained.
		</div>
        <div id=\"tech4\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
	 <b>Weaponary Techs</b><br />
                Each weapon tech gained increases the damage of all your ship weapons by 10%.  This is particularly useful for countering the effectiveness of advanced enemy hulls. Orbital and Ground defence turrets do not gain a bonus from this tech.
		</div>
        <div id=\"tech5\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Hull Techs</b><br />
                Each hull tech gained increases the damage absorbtion of all your ships by 10%.  This is particularly useful for countering the effectiveness of advanced enemy weapons. Orbital and Ground defence turrets do not gain a bonus from this tech.
                </div>
        <div id=\"tech6\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Shield Techs</b><br />
                Each shield tech gained provides an additional 5% chance to completely deflect any hit a ship of yours takes. Base shields offer a 10% deflection chance; 20% in the case of Dreadnaughts since they have dual shields..
                </div>
        <div id=\"tech7\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Terraforming</b><br />
                Each level of terraforming tech you unlock allows you to colonize a larger variety of planets that must first be terraformed. Planets with a Zero terrforming requirement do not require any terraforming tech to be colonized.
                </div>
        <div id=\"tech8\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Spying Tech</b><br />
                Spying allows you to gain useful information on enemies when sending out probes to scan sectors controlled by the enemy.  The higher your spying tech level is relative to the enemies counter-spying tech, the more information you gather about that enemy and the more accurate that information is.
                </div>
        <div id=\"tech9\" style=\"width:322px;height:240px;display:none;padding:5px;position:absolute;background-color:black;\">
         <b>Counter-Spying Tech</b><br />
                Counter-spying allows you to prevent incoming enemy probes from collecting useful information on sectors you control.  The higher your counter-spying skill, the less useful the information an enemy scan will gather..
                </div>

        <button id=\"t1\" style=\"display:inline;width:158px;height:81px;background-color:lightgreen;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
			onclick=\"buyTech(1);\"	>
		<b>Metal Tech 1</b><br />
		Research: 10<br />
		+10% Metal Production
		</button>
        <button id=\"t2\"  style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
                        onclick=\"buyTech(2);\" >
                <b>Metal Tech 2</b><br />
                Research: 100 <br />
		+10% Metal Production
                </button>
        <button  id=\"t3\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
                        onclick=\"buyTech(3);\">
                <b>Laser Drills</b><br />
                Research: 1000<br />
                +10% Metal Production
                </button>
        <button id=\"t4\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
                        onclick=\"buyTech(4);\">
                <b>Mass Protonation</b><br />
                Research: 10000<br />
                +10% Metal Production
                </button>
        <button id=\"t5\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\"
                        onclick=\"buyTech(5);\">
                <b>Lunar Excavation</b><br />
                Research: 100000<br />
                +10% Metal Production
                </button>
        <button id=\"t6\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\" onclick=\"buyTech(6);\" >
                <b>Pre-Liquefaction</b><br />
                Research: 1000000<br />
                +10% Metal Production
                </button>
        <button id=\"t7\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\" onclick=\"buyTech(7);\" >
                <b>Exigent Isolation</b><br />
                Research: 10000000<br />
                +10% Metal Production
                </button>
        <button id=\"t8\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightgreen;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech1\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech1').style.display='none';\" onclick=\"buyTech(8);\" >
                <b>Anti-Matter Reversal</b><br />
                Research: 100000000<br />
                +10% Metal Production
                </button>
        <button id=\"t9\" style=\"display:inline;width:158px;height:81px;width:158px;height:81px;background-color:lightblue;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(9);\" >
                <b>Resonating Filters</b><br />
                Research: 10<br />
                +10% Crystal Output
                </button>
        <button id=\"t10\" style=\"display:none;width:158px;height:81px;width:158px;height:81px;background-color:lightblue;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(10);\" >
                <b>Radiobaric Fusion</b><br />
                Research: 100<br />
                +10% Crystal Output
                </button>
        <button id=\"t11\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(11);\" >
                <b>Thermo Catalysts</b><br />
                Research: 1000<br />
                +10% Crystal Output
                </button>
        <button id=\"t12\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(12);\" >
                <b>Picofused Dipoles</b><br />
                Research: 10000<br />
                +10% Crystal Output
                </button>
        <button id=\"t13\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(13);\" >
                <b>Residual Cycling</b><br />
                Research: 100000<br />
                +10% Crystal Output
                </button>
        <button id=\"t14\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(14);\" >
                <b>Self Recombination</b><br />
                Research: 1000000<br />
                +10% Crystal Output
                </button>
        <button id=\"t15\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(15);\" >
                <b>Stabilized Lattice</b><br />
                Research: 10000000<br />
                +10% Crystal Output
                </button>
        <button id=\"t16\" style=\"display:none;width:158px;height:81px;background-color:lightblue;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech2\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech2').style.display='none';\" onclick=\"buyTech(16);\" >
                <b>Thermaplane Reactor</b><br />
                Research: 100000000<br />
                +10% Crystal Output
                </button>
        <button id=\"t17\" style=\"display:inline;width:158px;height:81px;background-color:#9981FF;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(17);\" >
                <b>Quantum Computing</b><br />
                Research: 10<br />
                +10% Research Rate
                </button>
        <button id=\"t18\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(18);\" >
                <b>Neural Implants</b><br />
                Research: 100<br />
                +10% Research Rate
                </button>
        <button id=\"t19\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(19);\" >
                <b>Unverisal Education</b><br />
                Research: 1000<br />
                +10% Research Rate
                </button>
        <button id=\"t20\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(20);\" >
                <b>Digitized Reality</b><br />
                Research: 10000<br />
                +10% Research Rate
                </button>
        <button id=\"t21\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(21);\" >
                <b>Genetic Selection</b><br />
                Research: 100000<br />
                +10% Research Rate
                </button>
        <button id=\"t22\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(22);\" >
                <b>Unified Theory</b><br />
                Research: 1000000<br />
                +10% Research Rate
                </button>
        <button id=\"t23\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(23);\" >
                <b>Positron Networks</b><br />
                Research: 10000000<br />
                +10% Research Rate
                </button>
        <button id=\"t24\" style=\"display:none;width:158px;height:81px;background-color:#9981FF;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech3\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech3').style.display='none';\" onclick=\"buyTech(24);\" >
                <b>Collective Thought</b><br />
                Research: 100000000<br />
		+10% Research Rate
                </button>
        <button id=\"t25\" style=\"display:inline;width:158px;height:81px;background-color:pink;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(25);\" >
                <b>Rail Guns</b><br />
                Research: 10<br />
                +10% Ship Attack
                </button>
        <button id=\"t26\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(26);\" >
                <b>Pulse Lasers</b><br />
		Research: 100<br />
                +10% Ship Attack
                </button>
        <button id=\"t27\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(27);\" >
                <b>HyperV Missles</b><br />
                Research: 1000<br />
                +10% Ship Attack
                </button>
        <button id=\"t28\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(28);\" >
                <b>Plasma Torpedos</b><br />
                Research: 10000<br />
                +10% Ship Attack
                </button>
        <button id=\"t29\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(29);\" >
                <b>Phase Disrupters</b><br />
                Research: 100000<br />
                +10% Ship Attack
                </button>
        <button id=\"t30\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(30);\" >
                <b>Tachyon Warheads</b><br />
                Research: 1000000<br />
                +10% Ship Attack
                </button>
        <button id=\"t31\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(31);\" >
                <b>X4-BMT Cannon</b><br />
                Research: 10000000<br />
                +10% Ship Attack
                </button>
        <button id=\"t32\" style=\"display:none;width:158px;height:81px;background-color:pink;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech4\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech4').style.display='none';\" onclick=\"buyTech(32);\" >
                <b>Anti-Matter Bolt</b><br />
                Research: 100000000<br />
                +10% Ship Attack
                </button>
        <button id=\"t33\" style=\"display:inline;width:158px;height:81px;background-color:yellow;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(33);\" >
                <b>Ceramic Hull</b><br />
                Research: 10<br />
                +10% Ship Health
                </button>
        <button id=\"t34\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(34);\" >
                <b>Duranium Hull</b><br />
                Research: 100<br />
                +10% Ship Health
                </button>
        <button id=\"t35\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(35);\" >
                <b>Phasic Hull</b><br />
                Research: 1000<br />
                +10% Ship Health
                </button>
        <button id=\"t36\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(36);\" >
                <b>Thermostatic Hull</b><br />
                Research: 10000<br />
                +10% Ship Health
                </button>
        <button id=\"t37\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(37);\" >
                <b>Ablative Hull</b><br />
                Research: 100000<br />
                +10% Ship Health
                </button>
        <button id=\"t38\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(38);\" >
                <b>Nanomatrix Hull</b><br />
                Research: 10000000<br />
                +10% Ship Health
                </button>
        <button id=\"t39\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(39);\" >
                <b>Reactive Hull</b><br />
                Research: 100000000<br />
                +10% Ship Health
                </button>
        <button id=\"t40\" style=\"display:none;width:158px;height:81px;background-color:yellow;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech5\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech5').style.display='none';\" onclick=\"buyTech(40);\" >
                <b>Hawk's Hull</b><br />
                Research: 1000000000<br />
                +10% Ship Health
                </button>
        <button id=\"t41\" style=\"display:inline;width:158px;height:81px;background-color:teal;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(41);\" >
                <b>Shields 1</b><br />
                Research: 10<br />
                +10% Hit Deflection
                </button>
        <button id=\"t42\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(42);\" >
                <b>Shields 2</b><br />
                Research: 100<br />
                +10% Hit Deflection
                </button>
        <button id=\"t43\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(43);\" >
                <b>Shields 3</b><br />
                Research: 1000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t44\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(44);\" >
                <b>Shields 4</b><br />
                Research: 10000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t45\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(45);\" >
                <b>Shields 5</b><br />
                Research: 100000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t46\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(46);\" >
                <b>Shields 6</b><br />
                Research: 1000000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t47\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(47);\" >
                <b>Shields 7</b><br />
                Research: 10000000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t48\" style=\"display:none;width:158px;height:81px;background-color:teal;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech6\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech6').style.display='none';\" onclick=\"buyTech(48);\" >
                <b>Shields 8</b><br />
                Research: 100000000<br />
                +10% Hit Deflection
                </button>
        <button id=\"t49\" style=\"display:inline;width:158px;height:81px;background-color:brown;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(49);\" >
                <b>Solar Reflectors</b><br />
                Research: 10<br />
                +1 Terraform
                </button>
        <button id=\"t50\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(50);\" >
                <b>Atmo-Compensators</b><br />
                Research: 100<br />
                +1 Terraform
                </button>
        <button id=\"t51\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(51);\" >
                <b>Geo Stabilizers</b><br />
                Research: 1000<br />
                +1 Terraform
                </button>
        <button id=\"t52\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(52);\" >
                <b>Artificial Gravity</b><br />
                Research: 10000<br />
		+1 Terraform
                </button>
        <button id=\"t53\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(53);\" >
                <b>Terraform 5</b><br />
                Research: 100000<br />
                +1 Terraform
                </button>
        <button id=\"t54\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(54);\" >
                <b>Terraform 6</b><br />
                Research: 1000000<br />
                +1 Terraform
                </button>
        <button id=\"t55\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(55);\" >
                <b>Terraform 7</b><br />
                Research: 10000000<br />
                +1 Terraform
                </button>
        <button id=\"t56\" style=\"display:none;width:158px;height:81px;background-color:brown;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech7\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech7').style.display='none';\" onclick=\"buyTech(56);\" >
                <b>Terraform 8</b><br />
                Research: 100000000<br />
                +1 Terraform
                </button>
        <button id=\"t57\" style=\"display:inline;width:158px;height:81px;background-color:gray;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(57);\" >
                <b>Spy 1</b><br />
                Research: 10<br />
		+1 Spy Skill
                </button>
        <button id=\"t58\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(58);\" >
                <b>Spy 2</b><br />
                Research: 100<br />
                +1 Spy Skill
                </button>
        <button id=\"t59\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(59);\" >
                <b>Spy 3</b><br />
                Research: 1000<br />
                +1 Spy Skill
                </button>
        <button id=\"t60\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(60);\" >
                <b>Spy 4</b><br />
                Research: 10000<br />
                +1 Spy Skill
                </button>
        <button id=\"t61\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(61);\" >
                <b>Spy 5</b><br />
                Research: 100000<br />
                +1 Spy Skill
                </button>
        <button id=\"t62\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(62);\" >
                <b>Spy 6</b><br />
                Research: 1000000<br />
                +1 Spy Skill
                </button>
        <button id=\"t63\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(63);\" >
                <b>Spy 7</b><br />
                Research: 10000000<br />
                +1 Spy Skill
                </button>
        <button id=\"t64\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech8\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech8').style.display='none';\" onclick=\"buyTech(64);\" >
                <b>Spy 8</b><br />
                Research: 100000000<br />
                +1 Spy Skill
                </button>
        <button id=\"t65\" style=\"display:inline;width:158px;height:81px;background-color:gray;\" class='tier1'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(65);\" >
                <b>Counter Spy 1</b><br />
                Research: 10<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t66\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier2'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(66);\" >
                <b>Counter Spy 2</b><br />
                Research: 100<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t67\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier3'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(67);\" >
                <b>Counter Spy 3</b><br />
                Research: 1000<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t68\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier4'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(68);\" >
                <b>Counter Spy 4</b><br />
                Research: 10000<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t69\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier5'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(69);\" >
                <b>Counter Spy 5</b><br />
                Research: 100000<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t70\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier6'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(70);\" >
                <b>Counter Spy 6</b><br />
                Research: 1000000<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t71\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier7'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(71);\" >
                <b>Counter Spy 7</b><br />
                Research: 10000000<br />
                +1 Counter-Spy Skill
                </button>
        <button id=\"t72\" style=\"display:none;width:158px;height:81px;background-color:gray;\" class='tier8'
                        onmouseover=\"hovertimer = setTimeout('hoverInfo(\'tech9\')',500);thisID=this;\"
                        onmouseout=\"clearTimeout(hovertimer);document.getElementById('tech9').style.display='none';\" onclick=\"buyTech(72);\" >
                <b>Counter Spy 8</b><br />
                Research: 100000000<br />
                +1 Counter-Spy Skill
                </button>



	</div>";
}
function combuild(){
	echo "<div id=\"build\" style=\"position:absolute;bottom:10px;left:0px;display:none;\">
		<button onclick=\"buyBuilding(1);\" style=\"background-color:lightgreen;width:158px;height:70px;\">
                <b>Metal Extractor <span id=\"b1\">1</span></b><br />
                Metal:  <span id=\"m1\">100</span><br />
		+100 Metal Production
                </button>
                <button onclick=\"buyBuilding(2);\" style=\"background-color:lightgreen;width:158px;height:70px;\">
                <b>Crystal Refinery <span id=\"b2\">1</span></b><br />
                Metal: <span id=\"m2\">100</span><br />
		+100 Crystal Output
                </button>
                <button onclick=\"buyBuilding(3);\" style=\"background-color:lightgreen;width:158px;height:70px;\">
                <b>Research Academy <span id=\"b3\">1</span></b><br />
                Metal: <span id=\"m3\">100</span><br />
		+100 Research Rate
                </button>
                <button onclick=\"buyBuilding(4);\" style=\"background-color:lightblue;width:158px;height:70px;\">
                <b>Spaceport <span id=\"b4\">1</span></b><br />
                Metal: <span id=\"m4\">100</span><br />
		+1 Max Ship Pop
                </button>
                <button onclick=\"buyBuilding(5);\" style=\"background-color:orange;width:158px;height:70px;\">
                <b>Orbital Array <span id=\"b5\">1</span></b><br />
                Metal: <span id=\"m5\">100</span><br />
		+1 Plantary Attack
                </button>
                <button onclick=\"buyBuilding(6);\" style=\"background-color:orange;width:158px;height:70px;\">
                <b>Ground Defence <span id=\"b6\">1</span></b><br />
                Metal:  <span id=\"m6\">100</span><br />
		+1 Plantary Hitpoint
                </button>
                <button onclick=\"buyShip(1);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Corvette</b><br />
                Metal: 100<br />
		Req: Spaceport 3
                </button>
                <button onclick=\"buyShip(2);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Destroyer</b><br />
                Metal: 100<br />
		Req: Spaceport 5
                </button>
                <button onclick=\"buyShip(3);\" style=\"background-color:yellow;width:158px;height:70px;\">
                <b>Build Scout</b><br />
                Metal: 100<br />
		Req: Spaceport 1
                </button>
		<button onclick=\"buyShip(4);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Cruiser</b><br />
                Metal: 100<br />
		Req: Spaceport 10
                </button>
		<button onclick=\"buyShip(5);\" style=\"background-color:pink;width:158px;height:70px;\">
                <b>Build Dreadnaught</b><br />
                Metal: 100<br />
		Req: Spaceport 15
                </button>
		<button onclick=\"buyShip(6);\" style=\"background-color:yellow;width:158px;height:70px;\">
                <b>Build Colony Ship</b><br />
                Metal: 100<br />
		Req: Spaceport 7
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
       	 		<button style=\"height:40px;width:157px;\" class='memory3' onclick=\"makeActive(this,'memory3');showShip('ship3');\"><b>Dreadnaughts</b></button>
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
        <div class=\"fleet3\" style=\"position:absolute; bottom:100px;left: 0px;display:none;width:495px;height:100px;\"><b>You are unable to colonize this planet.</b><br /><br />To Colonize this Planet:<br />-You need a Colony Ship in this sector<br />-You need a terraform tech level of 3</div>
      </div>
   ";
}

?>
