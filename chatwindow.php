<?php
function chatWindow(){
echo "
	<article style=\"position:relative;top:-135px;left:0;width:500px;height:135px;margin:0;padding:0;overflow:hidden;text-align:left;\">
		  <ul id=\"log_old\" style=\"overflow:auto;position:relative;bottom:0px;left:1px;margin:0;padding:0;height:100px;width:495px;\"></ul>
		  <form style=\"position:relative;top:0;left:0;margin:0;padding:0;\" onsubmit=\"sendChat();\">
	 	    	<input size=\"56\" type=\"text\" id=\"chat\" placeholder=\"type and press enter to chat\" />
	  	  </form>
	</article>
";}

function connectionInfo(){
echo "
        <div  style=\"position:absolute;top:0;left:550;\">
                <span id=\"status\" >Not connected</span>, Users connected: <span id=\"connected\">-</span>
        </div>
";}

?>
