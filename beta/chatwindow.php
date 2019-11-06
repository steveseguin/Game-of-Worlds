<?php
function chatWindow(){
echo "
	<article style=\"position:relative;top:-185px;left:0;width:500px;height:185px;margin:0;padding:0;overflow:hidden;;\">
		  <ul id=\"log\" style=\"overflow:hidden;position:relative;left:18px;top:20px;margin:0;padding:0;height:155px;width:495px;\"></ul>
		  <form style=\"position:relative;bottom:0;left:0;margin:0;padding:0;\" onsubmit=\"sendChat();\">
	 	    	<input size=\"56\" type=\"text\" id=\"chat\" placeholder=\"type and press enter to chat\" style=\"visibility:hidden\" />
	  	  </form>
	</article>
";}

function connectionInfo(){
echo "
        <div  style=\"position:absolute;top:0;left:0;\">
                <span id=\"status\" >Not connected</span>, Users connected: <span id=\"connected\">-</span>
        </div>
";}

?>
