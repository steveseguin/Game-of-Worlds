<HTML><HEAD><STYLE>
	.c0 {
		background: #D66;
	}
        .c1 {
                background: #CC4;
        }
        .c2 {
                background: #46F;
        }
        .c3 {
                background: #CAD;
        }
        .c4 {
                background: #88D;
        }
        .c5 {
                background: #F88;
        }
        .c6 {
                background: #8F8;
        }
        .c7 {
                background: #AAA;
        }
        .c8 {
                background: #F84;
        }
        .c9 {
                background: #E95;
        }
        .c10 {
                background: #DA6;
        }
	.c11 {
                background: #CB7;
        }
        .c12 {
                background: #BC8;
        }
   	li {
		margin-left: 0px;
	}
	a:link {
		text-decoration: none;
		color: #222;
	}
	a:visited {
		color: #222;
                text-decoration: none;
	}
	a:active {
		color: #222;
		text-decoration: none;
	}
	a:hover {
		text-decoration: none; 
		color: #fff;
	}
	div {
		color:black;
		display:inline-block;
		margin:30px;
		padding:30px;
		 -moz-border-radius: 5px;
       		 -webkit-border-radius: 5px;
       		 border-bottom: 1px solid #222;
	}

	body {
		background-attachment:fixed;
		background-color:#000;
		background-image:url(spacebak.jpg);
		color:white;
	}
</STYLE></HEAD><BODY><H1><CENTER><u>Tech Tree</u></CENTER></H1><?php
ini_set('display_errors', 'On');  // enable debugging mode ; disable on production

$handle = fopen("tek.txt", "r");
$contents = fread($handle, filesize("tek.txt"));
fclose($handle);

$contents = explode(":", $contents);

echo "<ul>";
$k=0;
while ($k<5){

$x=0;
$y=0;
$t=0;
$tt=0;
  foreach ($contents as $value)
  {
        $x=0;
        $y++;
        if (($y==5) || ($y==1))
        {
                $y=1;
                for ($i = 0; $i < count($contents); ++$i)
                {
			$j=floor($i/4);
			$tt=floor($t);
                        $x++;
                        if (($x==5) || ($x==1))
                        {
                                $x=1;
                        }
                        else if ($value==$contents[$i])
                        {
                                if (!isset($array[$j]))
				{
					if (isset($array[$tt]))
					{
						$array[$j]=$array[$tt]+1;
					}
					else
					{
						$array[$j]=1;
					}
				}
				else
				{
					if (isset($array[$tt]))
					{
						if ($array[$j] <= $array[$tt])
                                        	{
                                        	        $array[$j]=$array[$tt]+1;
                                        	}
					}
					else
					{
						$array[$tt]=0;
					}
				}
                        }
                }
	$t++;
	}
  }
  unset($value);
  $k++;
}
$x=0;
$y=0;
$t=0;
$z=1;
for ($zz=0; $zz <= max($array); ++$zz)
{
	echo "<h2>Tech Tier: ".$zz."</h2>";
	$x=0;
	$y=0;
	$t=0;
	$z=0;
foreach ($contents as $value)
{
 $z++;
 if (!isset($array[floor(($z-1)/4)]))
	{$array[floor(($z-1)/4)]=0;}
 if ($array[floor(($z-1)/4)]==$zz)
 {
	$x=0;
	$y++;
	if (($y==5) || ($y==1))
        {
		$t=0;
		$y=1;

		if (!isset($array[round($z/4)])){$array[floor($z/4)]=0;}

		echo "<div class=\"c".$array[floor($z/4)]."\"><b><h3><a id=\"".str_replace(' ', '', $value)."\">".$value." </a></h3></b><i>leads to ..</i><ul>";

		for ($i = 0; $i < count($contents); ++$i)
                {
			$x++;
                        if (($x==5) || ($x==1))
                        {
				$x=1;
			}
                        else if ($value==$contents[$i])
                        {
				 $t++;
                                 echo "<li><a href=\"#".str_replace(' ', '', $contents[($i-$x+1)])."\" class=\"c".$array[floor($i/4)]."\">".$contents[($i-$x+1)]."</a></li>";
                        }
		}
		if ($t==0){echo "<li><i>nothing</i></li>";}
		echo "<br /></ul>requisites..<ul>";
	}
	else if (trim($value))
	{
		$d=array_keys($contents, $value);
		for ($f = 0; $f < count($d); ++$f)
                {
			if ( ( $d[$f]%4 )==0 )
			{
				$e=$array[$d[$f]/4];
			}
		}
		echo "<li><a href=\"#".str_replace(' ', '', $value)."\" class=\"c".$e."\">".$value."</a></li>";
	}
	else if ($y==2)
	{
		echo "<li><i>nothing</i></li>";
	}
	if ($y==4)
	{
		echo "</ul></div>";
	}
 }
}
unset($value);
echo "<hr />";
}

?>
</BODY></HTML>
