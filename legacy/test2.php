
<?php
//      ini_set('display_errors', 'On');  // enable debugging mode ; disable on production
        session_start();
        include 'check.php';
        include 'lib.php'; // collection of custom php functions

?>
<html><head><style>
	body {
		margin:0;
		padding:0;
		font-size:80px;
		zoom:100%;
	}
	.sector {
		border-style:dashed;
		border-width;1px;
		width:800px;
		height:800px;
		display:inline-block;
		position:absolute;
	}
	.secDeets (
		display:none;
	}
</style>
<script>
function getElementsByClassName(node,classname) {
  if (node.getElementsByClassName) { // use native implementation if available
    return node.getElementsByClassName(classname);
  } else {
    return (function getElementsByClass(searchClass,node) {
        if ( node == null )
          node = document;
        var classElements = [],
            els = node.getElementsByTagName("*"),
            elsLen = els.length,
            pattern = new RegExp("(^|\\s)"+searchClass+"(\\s|$)"), i, j;

        for (i = 0, j = 0; i < elsLen; i++) {
          if ( pattern.test(els[i].className) ) {
              classElements[j] = els[i];
              j++;
          }
        }
        return classElements;
    })(classname, node);
  }
}
function hideclass(className) {
   var elements = getElementsByClassName(document, className),
       n = elements.length;
   for (var i = 0; i < n; i++) {
     var e = elements[i];
       e.style.display = 'none';
  }
}
function showclass(className) {
   var elements = getElementsByClassName(document, className),
       n = elements.length;
   for (var i = 0; i < n; i++) {
     var e = elements[i];
       e.style.display = 'block';
  }
}
var zoomlvl=0;;
function pollPageZoom() {
	if (zoomlvl!=window.innerWidth){
		if (1600<window.innerWidth && 1600>=zoomlvl){
			zoomlvl=window.innerWidth;
			hideclass("secDeets");
		}
		else if (1600<zoomlvl && 1600>=window.innerWidth){
			zoomlvl=window.innerWidth;
			showclass("secDeets");
		}
	}
}
</script>
</head><body onload="setInterval(pollPageZoom,180);">

<?php
    $x=0;
    $y=0;
    while ($y<10){
	$x=0;
	while ($x<10){
		echo "<div id=\"sector".$x.$y."\" class=\"sector\" style=\"left:".($x*800)."px;top:".($y*800)."px;\">Sector: ".$x.$y."<div class=\"secDeets\">details</div></div></div>";
		$x++;
	}
	$y++;
    }
?>
<script src="connect2.js" id="needsToLoadUpLate"></script>
</body></html>
