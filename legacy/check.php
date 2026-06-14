<?php

  if (!isset($_SESSION['id']) || !isset($_SESSION['name']) || !isset($_SESSION['hash']) || !isset($_SESSION['gameid']) || $_SESSION['gameid']==0 || !isset($_SESSION['tkey']) ){  // make sure user is signed in before continuing...
		echo "Session Expired. Please re-log-in. Redirecting now...";
                session_destroy();
                header("Location: ./index.php");
                die();
  }


function sendtoServer(){
	if ( (isset($_SESSION['tkey'])) && (isset($_SESSION['id'])) ){
		echo "<script>
				function authUser(){
        				websocket.send('//auth:".$_SESSION['id'].":".$_SESSION['tkey']."');
					return '".$_SESSION['name']."';
				}
		</script>";
	}
}

function check_input($data)
{
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    $data = htmlentities($data);
    $data = mysql_real_escape_string($data);

    return $data;
}

?>
