<?php
//	ini_set('display_errors', 'On');  // enable debugging mode ; disable on production
        session_start();
	include 'check.php';
	include 'lib.php'; // collection of custom php functions

?>
<html>
<head>
	<script src="functions.js"></script>
	<style>
		button {margin:0;padding:0;overflow:hidden;}
		td {font-size:70%;}
	</style>
</head>
<body style="z-index:-3;overflow:hidden;margin:0;background:#222;background-image:url('spacebak.jpg');color:white;font-family:Verdana;">
        <script>
                if (window.screen.availHeight < window.screen.availWidth){
                        document.body.style.zoom=window.screen.availHeight/700;
                        document.body.style.width=window.screen.availWidth;
                        document.body.style.height=window.screen.availHeight;

                }
                else {
                        document.body.style.zoom=window.screen.availWidth/700;
	                document.body.style.width=window.screen.availWidth;
                        document.body.style.height=window.screen.availHeight;
                }
        </script>
	<?php
		sendtoServer();
		createSector();
		makeGUI();
		connectionInfo();
		reConnectWindow();
	?>
	<script id="mainScriptsInit">
		disableSelection(document);
	</script>
        <script src="connect.js" id="needsToLoadUpLate"></script>

</body>
</html>
