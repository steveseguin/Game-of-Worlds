<?php
	if (rand(0,1)){
	        echo "<img src=\"title.jpg\"/><br />";
        }
	else {
		echo "<img src=\"title2.jpg\"/><br />";
	}
	echo "
	<div id=\"contact\">
	   <h1>Login</h1>
           <form action=\"index.php\" method='POST'>
                Username:<input type=\"text\" id=\"username\" name=\"username\" /><br />
                Password:<input type=\"password\" id=\"password\" name=\"password\" /><br />
                <br /><input type=\"submit\" id=\"login\" name=\"login\" value=\"Login\"/><br />
                <br /><br />
		<p align=\"right\" style=\"margin:0 16px 0 0\"\">
			<a href=\"index.php?account=new\">Create an account here</a>
		</p>
           </form>
        </div>
	<div id=\"case\">
	        <div style=\"width:710px;\">
			<font style=\"font-size:42px\">A Free-to-Play Online Boardgame</font>
		</div><br />
        	<div style=\"width:130px;height:185px;\"><img width=\"130px\" src=\"html5_logo.png\" /></div>
	</div><br /><br />
	<div style=\"width:940px;\">
		Copyright 2012 - Steve Seguin


	</div>
	";

?>
