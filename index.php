<html><head>
	<LINK href="main.css" rel="stylesheet" type="text/css">
</head><body><center>
<?php
session_start();

$con = mysql_connect("127.0.0.1","root","bitnami");
if (!$con)
  {
  die('Could not connect: ' . mysql_error());
  }
mysql_select_db("game", $con);

if (empty($_GET) && empty($_POST) && !$_SESSION['id']){   /////// LOGIN SCREEN
        include 'header.php';
	include 'home.php';
}
else if (intval(check_input(key($_GET)))){
	$temp = intval(check_input(key($_GET)));
	joinGame($temp);
}
else if ( strlen($_POST['passwordcheck']))  ///// CREATE A NEW ACCOUNT FUNCTION
{
	$username = check_input($_POST['username']);
	$password = check_input($_POST['password']);
	$email = check_input($_POST['email']);

		$salt = hash('sha256', uniqid(mt_rand(), true) . 'hjhskok1231fdsa' . strtolower($username));
		$hash = $salt . $password;
		for ( $i = 0; $i < 100000; $i ++ )
		{
		    $hash = hash('sha256', $hash);
		}

	$password = $salt . $hash;

	$results = mysql_query("SELECT id FROM users WHERE name = '$username'");
	$results = mysql_fetch_array($results);
	if (!$results){
	        $tkey = rand(10000000000000,99999999999999999);
		echo "Account created.";
		mysql_query("INSERT INTO users (name, password, tempkey, email) VALUES ('$username', '$password', '$tkey', '$email')");
		$_SESSION['tkey'] = $tkey;
                $_SESSION['id'] = mysql_insert_id(); // store player ID as session data; remain logged in
		$_SESSION['name'] = $username;
                $_SESSION['hash'] = $password;
                $_SESSION['gameid'] = 0;
		header("Location: ./index.php");
                mysql_close($con);
                die();
	}
	else {
		echo "The username <b>".$username."</b> already exists. Please try something else.";
	}
}
else if (strlen($_POST['login'])){   ////// LOGGING IN FUNCTION
	echo "<h1>LOGGING IN</h1>";

        $username = check_input($_POST['username']);
        $password = check_input($_POST['password']);

 	$result = mysql_query("SELECT * FROM users WHERE name = '$username' LIMIT 1");
	$result = mysql_fetch_array($result);

	// The first 64 characters of the hash is the salt
	$salt = substr($result['password'], 0, 64);
	$hash = $salt . $password;

	// Hash the password as we did before
	for ( $i = 0; $i < 100000; $i ++ )
	{
	    $hash = hash('sha256', $hash);
	}

	$hash = $salt . $hash;


	if ( $hash == $result['password'] )
	{
	    	echo "LOGGED IN OKAY";
		$_SESSION['id'] = $result['id']; // store player ID as session data; remain logged in
		$_SESSION['name'] = $username;
                $_SESSION['gameid'] = $result['currentgame'];
		$_SESSION['hash'] = $hash;
	        $tkey = rand(100000000000000,999999999999999999);
		$_SESSION['tkey'] = $tkey;
		mysql_query("UPDATE users SET tempkey = '".$tkey."' WHERE id = '".$result['id']."'");
                if ($result['currentgame']!= 0) {
                      //  header("Location: ./game.php");
                	header("Location: ./index.php");
		}
                else {
                        header("Location: ./index.php");
                }
		mysql_close($con);
        	die();
	}
	else {
		echo "Login failed. Please check the username and password that were entered.";
	}
}
else if ( strlen($_GET['account']))  // CREATE A NEW ACCOUNT SCREEN
{
        include 'header.php';
	echo "<br /><br /><div style=\"max-width:922px\">";
	echo "<h1>Create a New Account</h1>
	<form action=\"index.php\" method='POST'>
                Enter a Username:<input type=\"text\" name=\"username\" id=\"username\"/><br />
                Enter a Password:<input type=\"password\" name=\"password\" id=\"password\"/><br />
                Retype Password:<input type=\"password\" name=\"passwordcheck\" id=\"passwordcheck\" /><br /><br />
                Your email (optional):<input type=\"text\" name=\"email\" id=\"email\"/><br />Emails are only used for verification purposes and critical notices. We also store passwords as 256-bit randomily salted hashes, which largely secures your personal information from hackers. We reserve the right to delete or suspend your account at our discretion.<br /><br />
		<input type=\"submit\" id=\"register\" name=\"register\" onclick=\"if (!document.getElementById('password').value){alert ('Please enter a username');return false;} else if(document.getElementById('password').value==document.getElementById('passwordcheck').value){return true;} else {alert('Passwords do not match');return false;}\" value=\"Create Account\"/><br />
        </form></div>
	<br /><br /><div>
	<img align=\"left\" src=\"chrome.png\" /><br /><br />
	<h3>This game requires an HTML5-compliant browser, such as the newest version of Google Chrome.</h3>
	<a href=\"https://www.google.com/chrome\">Google Chrome</a> is available for Windows, MacOS, Linux, and Android ICS.
	</div>
	";
}
else if ( strlen($_GET['newgame']) && $_SESSION['id'] && isset($_SESSION['id'])) // creating a new game SQL function stuff
  {

        $id = $_SESSION['id'];
        $userinfo = mysql_query("SELECT * FROM users WHERE id = '$id'");
        $userinfo =  mysql_fetch_array($userinfo);

        if ($_SESSION['hash']!=$userinfo['password']){

                echo "Incorrect User Auth: ";
                loguserout();
        }

	$gamesize=check_input($_GET['newgame']);
  	$Tod = strval(date('D M j Y, G:i:s'));

	echo "Creating new game.  You should be redirected to it now...";
        mysql_query("INSERT INTO games (date, maxplayers, size) VALUES ('$Tod', '8', '$gamesize')");
	$Tid= mysql_insert_id($con);
	$_SESSION['gameid'] = $Tid;
	mysql_query("UPDATE users SET currentgame = '$Tid' WHERE id = '$id'");
	mysql_query("CREATE TABLE map".$Tid." (
		sectorid int NOT NULL AUTO_INCREMENT,
		PRIMARY KEY(sectorid),
                sectortype int,
                ownerid int NOT NULL,
                colonized int NOT NULL,
		artifact int NOT NULL,
                metalbonus int,
                crystalbonus int,
                orbitalturret int NOT NULL,
                warpgate int NOT NULL,
		academylvl int NOT NULL,
		shipyardlvl int NOT NULL,
		metallvl int NOT NULL,
		crystallvl int NOT NULL,
                terraformlvl int NOT NULL,
                planetname int,
                totalship1 int NOT NULL,
                totalship2 int NOT NULL,
                totalship3 int NOT NULL,
                totalship4 int NOT NULL,
                totalship5 int NOT NULL,
                totalship6 int NOT NULL,
                totalship7 int NOT NULL,
                totalship8 int NOT NULL,
                totalship9 int NOT NULL,
		totship1build int NOT NULL,
                totship2build int NOT NULL,
                totship3build int NOT NULL,
                totship4build int NOT NULL,
                totship5build int NOT NULL,
                totship6build int NOT NULL,
                totship7build int NOT NULL,
                totship8build int NOT NULL,
                totship9build int NOT NULL
	    )
	");
	for ($x = 1; $x<=8; $x++){
		for ($y = 1; $y<=14; $y++){
			$z=ceil(pow(rand(1,81),0.5));
			$a=0;
			if (!rand(0,2)){$a = rand(1,5);}
			$m = rand(1,6)*rand(1,36)+rand(0,36)+rand(0,36);
			$c = rand(1,6)*rand(1,36)+rand(0,36)+rand(0,36);
			$t = 9-$z;
			echo $z.":".$a.":".$m.":".$c.":".$t."<br />";
			mysql_query("INSERT INTO map".$Tid." (sectortype,artifact,metalbonus,crystalbonus,terraformlvl) VALUES ('$z','$a','$m','$c','$t')");

		}
	}
	$seclast=0;
	$secnow=0;
	$homelist = array();
	for ($i=1;$i<9;$i++){
		$secnow=rand( $i%2*4+1 , $i%2*4+4) + rand( abs(($i-2)*8*2),($i+1)*8*2 );
		if ($seclast==$secnow  || $secnow > 114 || $secnow < 1){$i--;}
		else {
			$homelist[$i]=$secnow;
			$seclast=$secnow;
	        	mysql_query("UPDATE map".$Tid." SET ownerid = 0, artifact = '0', colonized = '0', sectortype = '10', metalbonus = '100', crystalbonus = '100', terraformlvl ='0' WHERE sectorid = '".$secnow."'");
		}
	}
	$secnow = $homelist[rand(1,8)];
        mysql_query("UPDATE map".$Tid." SET ownerid = ".$id.", colonized = '1', metallvl = '1', orbitalturret = '1' WHERE sectorid = '".$secnow."'");

        mysql_query("CREATE TABLE players".$Tid." (
                id int NOT NULL AUTO_INCREMENT,
                PRIMARY KEY(id),
		playerid int,
                score int NOT NULL,
                metal int NOT NULL DEFAULT '0',
                crystal int NOT NULL DEFAULT '0',
		research int NOT NULL DEFAULT '0',
		tech1 int NOT NULL,
                tech2 int NOT NULL,
                tech3 int NOT NULL,
                tech4 int NOT NULL,
                tech5 int NOT NULL,
                tech6 int NOT NULL,
                tech7 int NOT NULL,
                tech8 int NOT NULL,
                tech9 int NOT NULL
        )
        ");

	mysql_query("INSERT INTO players".$Tid." (playerid, metal, crystal, research) VALUES ('$id','300','100','100')");
	header("Location: ./game.php");
        mysql_close($con);
        die();
}
else if ( strlen($_GET['signout'])  && $_SESSION['id'] ) {
	loguserout();
}
else if ( $_SESSION['id'])  // create game menu
{
	include 'header.php';
	echo "
		<br /><br />Only the Join/Create game feature is currently enabled. **GAME IS IN DEVELOPMENT**
		<br /><br /><img src=\"topbar.jpg\" /><br /><br /><img src=\"playerstats.jpg\"  /><br /><br />
		<div>[Ladder Games] | [Custom Games] | [King of the Artifacts] | [Blorg Tag] | [Test Server]</div>
		<img style=\"display:block;position:relative;top:-250px;right:-430px;\" src=\"buygold.jpg\" \>
		<a href=\"tutorial.php\"><img style=\"display:block;position:relative;top:-650px;right:400px;\" src=\"tutorial.jpg\" \></a>
	";
	echo "<br /><br /><div  style=\"position:relative;top:-1260px;right:0px;\" >";
	$id = $_SESSION['id'];
        $userinfo = mysql_query("SELECT * FROM users WHERE id = '$id'");
	$userinfo =  mysql_fetch_array($userinfo);

	if ($_SESSION['hash']!=$userinfo['password']){
		echo "Incorrect User Auth: ";
		loguserout();
	}
        echo "Hello ".$_SESSION['name'];
        echo " [<a href='index.php?signout=true'>logout</a>]<br /><br />";
	if ($userinfo['currentgame'] != 0 ){
		$_SESSION['gameid'] = $userinfo['currentgame'];
		echo "<h1>Test Server</h1>You are currently active in a game. <a href='game.php'>Click here</a> to join it.<br />";
	}
        $result = mysql_query("SELECT * FROM games ORDER BY id DESC LIMIT 0,20");
        echo "You can create a new game or join one of the following open games.<br /><br />";
	echo "<table border='1'>";
                echo "<tr>";
                echo "<td align='center'>Game ID</td>";
                echo "<td align='center'>Status</td>";
                echo "<td align='center'>Players</td>";
                echo "<td align='center'>Date Created</td>";
                echo "<td align='center'>Map Size</td>";
                echo "</tr>";
        while($row = mysql_fetch_array($result))
          {
                echo "<tr>";
	                if ($row['turn']>0){
	                        //echo "<td align='center'>". $row['id']."</td>";
				//echo "<td align='center'>Started</td>";
                                //echo "<td align='center'>".$row['maxplayers']." max</td>";
                                //echo "<td align='center'>". $row['date']."</td>";
                                //echo "<td align='center'>". $row['size']."</td>";
			}
			else if ($row['turn']==0){
	                        echo "<td align='center'>". $row['id']."</td>";
                                echo "<td align='center'>Starting</td>";
				echo "<td align='center'>".$row['maxplayers']." max</td>";
	                        echo "<td align='center'>". $row['date']."</td>";
	                        echo "<td align='center'>". $row['size']."</td>";
                        }
			else {
				echo "<td align='center'>". $row['id']."</td>";
				$whosin = mysql_query("SELECT id FROM players".$row['id']);
				$whosin = count($whosin);
				if ($userinfo['currentgame'] != 0 ){
					echo "<td align='center'><a onclick=\" if (!confirm('You are already in a game. Join this new game?')){return false}\" href='index.php?".$row['id']."'> Join </a></td>";
				}
				else {
					echo "<td align='center'><a href='index.php?".$row['id']."'> Join </a></td>";
				}
				echo "<td align='center'>". $whosin." of ".$row['maxplayers']."</td>";
	                        echo "<td align='center'>". $row['date']."</td>";
	                        echo "<td align='center'>". $row['size']."</td>";
			}
                echo "</tr>";
          }
        echo "</table><br />";
	echo "<table><tr>";
//        echo "<td><form method='post' action='index.php?newgame=2'><input type='submit' value='Create a Medium Game' /></form></td>";
        echo "<td><form method='post' action='index.php?newgame=1'><input type='submit' value='Create a Game' /></form></td>";
  //      echo "<td><form method='post' action='index.php?newgame=3'><input type='submit' value='Create a Large Game' /></form></td>";
	echo "</tr></table>";
	echo "</div>";
}
else {
	echo "Error.  Nothing to do..";
	echo "<br /><br /><a href='index.php?signout=true'>Click here to sign out and then sign back in.</a>";
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
function joinGame($gameidt){
        if (isset($_SESSION['id'])){
            $result2 = mysql_query("SELECT * FROM games WHERE id = ".$gameidt);
            $result2 = mysql_fetch_array($result2);
	  if ($result2["turn"]==-1){
                $result3 = mysql_query("SELECT playerid FROM players".$gameidt);
                $result = sizeof($result3);
		while($row = mysql_fetch_array($result3))
  		{
			if ($row["playerid"]==$_SESSION['id']){
				mysql_query("UPDATE users SET currentgame = ".$gameidt." WHERE id = '".$_SESSION['id']."'");
				$_SESSION['gameid'] = $gameidt;
				header("Location: ./game.php");
				mysql_close($con);
                        	die();
			}
                }
		if ($result < 4){
                        mysql_query("UPDATE users SET currentgame = ".$gameidt." WHERE id = '".$_SESSION['id']."'");
                        mysql_query("INSERT INTO players".$gameidt." (playerid, metal, crystal, research) VALUES ('".$_SESSION['id']."','300','100','100')");
			mysql_query("UPDATE map".$gameidt." SET ownerid = ".$_SESSION['id'].", colonized = '1',  metallvl = '1', orbitalturret = '1' WHERE sectortype = 10 AND ownerid = 0 ORDER BY sectorid DESC LIMIT 1");
                        $_SESSION['gameid'] = $gameidt;
                        header("Location: ./game.php");
                        mysql_close($con);
                        die();
                }
                if ($result < 8){
                        mysql_query("UPDATE users SET currentgame = ".$gameidt." WHERE id = '".$_SESSION['id']."'");
                        mysql_query("INSERT INTO players".$gameidt." (playerid, metal, crystal, research) VALUES ('".$_SESSION['id']."','300','100','100')");
                        mysql_query("UPDATE map".$gameidt." SET ownerid = ".$_SESSION['id'].", colonized = '1',  metallvl = '1', orbitalturret = '1' WHERE sectortype = 10 AND ownerid = 0 LIMIT 1");
                        $_SESSION['gameid'] = $gameidt;
                        header("Location: ./game.php");
                        mysql_close($con);
                        die();
                }
                else {
                        echo "<script>alert('The game is currently full. Please select another game.');</script>";
                        header("Location: ./index.php");
                        mysql_close($con);
                        die();
                }
           }
           else {
                        echo "<script>alert('The game already has started. Please select another game.');</script>";
                        header("Location: ./index.php");
                        mysql_close($con);
                        die();
           }
        }
        else {
                echo "<script>alert('Session timed out. Please sign back in.');</script>";
                header("Location: ./index.php");
                mysql_close($con);
                die();
        }
        //check if game exists; if its open; its slots available; .. give warning about leaving old game if so (confirm box?)
	//check if game exists; if its open; its slots available; .. give warning about leaving old game if so (confirm box?) 
}
function loguserout(){
        echo "logging out...";
        unset($_SESSION['id']);
        unset($_SESSION['name']);
        unset($_SESSION['hash']);
        unset($_SESSION['gameid']);
        unset($_SESSION['tkey']);
        session_destroy();
        header("Location: ./index.php");
        mysql_close($con);
        die();
}
mysql_close($con);

?>
</center>
</body></html>
