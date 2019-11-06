<?php
ini_set('display_errors', 'On');  // enable debugging mode ; disable on production
include 'lib.php'; // collection of custom php functions
?>

<html>
<head>
	<script src="functions.js"></script>
	<script src="http://html5demos.com/js/h5utils.js"></script>
</head>
<body style="overflow:hidden;margin:0;background:#444;background-image:url('spacebak.jpg');color:white;font-family:Verdana;">
	<?php
		createSector();
		makeGUI();
		connectionInfo();
	?>
	<script id="mainScriptsInit">
		disableSelection(document);
	</script>
	<script src="connect.js" id="needsToLoadUpLate"></script>
</body>
</html>
