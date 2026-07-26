param(
    [string]$IconRoot = (Join-Path $PSScriptRoot '..\lore\visual-reference\icon-system')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resolvedRoot = [System.IO.Path]::GetFullPath($IconRoot)
$catalogPath = Join-Path $resolvedRoot 'catalog.json'
$atlasRoot = Join-Path $resolvedRoot 'atlases'
$outputRoot = Join-Path $resolvedRoot 'icons'
$catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Convert-ToSlug {
    param([string]$Value)

    return $Value.ToLowerInvariant().Replace('_', '-').Replace(' ', '-')
}

function Save-GridCell {
    param(
        [string]$Atlas,
        [int]$Columns,
        [int]$Rows,
        [int]$Index,
        [string]$Destination
    )

    $source = [System.Drawing.Bitmap]::FromFile($Atlas)
    try {
        $column = $Index % $Columns
        $row = [math]::Floor($Index / $Columns)
        if ($row -ge $Rows) {
            throw "Cell $Index is outside the ${Columns}x${Rows} atlas $Atlas"
        }

        $left = [math]::Floor(($column * $source.Width) / $Columns)
        $right = [math]::Floor((($column + 1) * $source.Width) / $Columns)
        $top = [math]::Floor(($row * $source.Height) / $Rows)
        $bottom = [math]::Floor((($row + 1) * $source.Height) / $Rows)
        $cellWidth = $right - $left
        $cellHeight = $bottom - $top
        $side = [math]::Min($cellWidth, $cellHeight)
        $cropX = $left + [math]::Floor(($cellWidth - $side) / 2)
        $cropY = $top + [math]::Floor(($cellHeight - $side) / 2)

        $target = New-Object System.Drawing.Bitmap 256, 256
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($target)
            try {
                $graphics.Clear([System.Drawing.Color]::FromArgb(7, 9, 11))
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $sourceRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side
                $targetRect = New-Object System.Drawing.Rectangle 0, 0, 256, 256
                $graphics.DrawImage($source, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
            } finally {
                $graphics.Dispose()
            }

            $destinationDirectory = Split-Path -Parent $Destination
            New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
            $target.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $target.Dispose()
        }
    } finally {
        $source.Dispose()
    }
}

$techLayouts = @(
    @{ Atlas = 'tech-economy-metal.png'; Columns = 5; Rows = 2; Keys = @('METAL_EXTRACTION') },
    @{ Atlas = 'tech-economy-crystal.png'; Columns = 5; Rows = 2; Keys = @('CRYSTAL_REFINING') },
    @{ Atlas = 'tech-economy-research.png'; Columns = 5; Rows = 2; Keys = @('RESEARCH_NETWORKS') },
    @{ Atlas = 'tech-weapons.png'; Columns = 5; Rows = 3; Keys = @('LASER_WEAPONS', 'PLASMA_CANNONS', 'ANTIMATTER_WARHEADS') },
    @{ Atlas = 'tech-missiles.png'; Columns = 3; Rows = 2; Keys = @('ROCKETRY', 'HYPERV_MISSILES') },
    @{ Atlas = 'tech-armor.png'; Columns = 5; Rows = 3; Keys = @('REINFORCED_HULLS', 'REACTIVE_ARMOR', 'ADAPTIVE_PLATING') },
    @{ Atlas = 'tech-shields.png'; Columns = 5; Rows = 2; Keys = @('DEFLECTOR_SHIELDS', 'PHASE_SHIELDS') },
    @{ Atlas = 'tech-propulsion.png'; Columns = 5; Rows = 2; Keys = @('ION_DRIVES', 'WARP_DRIVES') },
    @{ Atlas = 'tech-shipyards.png'; Columns = 3; Rows = 1; Keys = @('MILITARY_SHIPYARDS') },
    @{ Atlas = 'tech-orbital.png'; Columns = 5; Rows = 1; Keys = @('ORBITAL_ENGINEERING') },
    @{ Atlas = 'tech-terraforming.png'; Columns = 5; Rows = 1; Keys = @('TERRAFORMING') },
    @{ Atlas = 'tech-intel.png'; Columns = 4; Rows = 4; Keys = @('ESPIONAGE', 'COUNTER_INTEL') }
)

$written = 0
foreach ($layout in $techLayouts) {
    $atlasPath = Join-Path $atlasRoot $layout.Atlas
    $cell = 0
    foreach ($key in $layout.Keys) {
        $technology = $catalog.technologies | Where-Object { $_.key -eq $key }
        if (-not $technology) {
            throw "Catalog is missing technology $key"
        }

        $technologySlug = Convert-ToSlug $technology.key
        for ($level = 1; $level -le $technology.aliases.Count; $level += 1) {
            $filename = 'level-{0:D2}.png' -f $level
            $destination = Join-Path $outputRoot "tech\$technologySlug\$filename"
            Save-GridCell -Atlas $atlasPath -Columns $layout.Columns -Rows $layout.Rows -Index $cell -Destination $destination
            $cell += 1
            $written += 1
        }
    }
}

$buildingAtlas = Join-Path $atlasRoot 'buildings.png'
for ($index = 0; $index -lt $catalog.buildings.Count; $index += 1) {
    $destination = Join-Path $outputRoot $catalog.buildings[$index].icon
    Save-GridCell -Atlas $buildingAtlas -Columns 3 -Rows 3 -Index $index -Destination $destination
    $written += 1
}

$shipAtlas = Join-Path $atlasRoot 'ships.png'
for ($index = 0; $index -lt $catalog.ships.Count; $index += 1) {
    $destination = Join-Path $outputRoot $catalog.ships[$index].icon
    Save-GridCell -Atlas $shipAtlas -Columns 3 -Rows 3 -Index $index -Destination $destination
    $written += 1
}

$actionAtlas = Join-Path $atlasRoot 'actions.png'
for ($index = 0; $index -lt $catalog.actions.Count; $index += 1) {
    $destination = Join-Path $outputRoot $catalog.actions[$index].icon
    Save-GridCell -Atlas $actionAtlas -Columns 4 -Rows 4 -Index $index -Destination $destination
    $written += 1
}

if ($written -ne $catalog.counts.totalIcons) {
    throw "Wrote $written icons, expected $($catalog.counts.totalIcons)"
}

$readme = New-Object System.Collections.Generic.List[string]
$readme.Add('# Gameplay Icon System')
$readme.Add('')
$readme.Add('Status: **REFERENCE**. The names and icons are ready for UI integration, but this folder')
$readme.Add('does not by itself change the shipped labels or controls.')
$readme.Add('')
$readme.Add("This catalog contains **$($catalog.counts.totalIcons) individually usable 256x256 PNG icons**:")
$readme.Add('')
$readme.Add("- $($catalog.counts.researchLevels) research-level icons;")
$readme.Add("- $($catalog.counts.buildingStates) current building-state icons;")
$readme.Add("- $($catalog.counts.shipTypes) standard ship-type icons;")
$readme.Add("- $($catalog.counts.actions) core gameplay-action icons.")
$readme.Add('')
$readme.Add('## Display rule')
$readme.Add('')
$readme.Add('Use the evocative alias as the primary label and put the real mechanic immediately beneath it.')
$readme.Add('Never make a player remember that "Fleet Foundry" means level 3. A complete card should read:')
$readme.Add('')
$readme.Add('**Fleet Foundry**  ')
$readme.Add('Spaceport level 3 - 32 production/turn')
$readme.Add('')
$readme.Add('Aliases add setting character; canonical labels, numeric levels, requirements, and effects remain')
$readme.Add('the gameplay contract.')
$readme.Add('')
$readme.Add('## Research levels')
$readme.Add('')

$currentBranch = ''
foreach ($technology in $catalog.technologies) {
    if ($technology.branch -ne $currentBranch) {
        $currentBranch = $technology.branch
        $readme.Add("### $currentBranch")
        $readme.Add('')
    }

    $readme.Add("#### $($technology.canonicalName)")
    $readme.Add('')
    $readme.Add('| Icon | Alias | Actual mechanic |')
    $readme.Add('|---|---|---|')
    $technologySlug = Convert-ToSlug $technology.key
    for ($level = 1; $level -le $technology.aliases.Count; $level += 1) {
        $filename = 'level-{0:D2}.png' -f $level
        $iconPath = "icons/tech/$technologySlug/$filename"
        $alias = $technology.aliases[$level - 1]
        $readme.Add("| ![$alias]($iconPath) | **$alias** | $($technology.canonicalName) level $level - $($technology.mechanic) |")
    }
    $readme.Add('')
}

$readme.Add('## Buildings and upgrades')
$readme.Add('')
$readme.Add('Only the Spaceport has a shipped level progression. Metal Extractors, Crystal Refineries,')
$readme.Add('Research Academies, and Orbital Turrets are repeated installations; presenting their count as a')
$readme.Add('level would describe mechanics the game does not have.')
$readme.Add('')
$readme.Add('| Icon | Alias | Actual |')
$readme.Add('|---|---|---|')
foreach ($building in $catalog.buildings) {
    $readme.Add("| ![$($building.alias)](icons/$($building.icon)) | **$($building.alias)** | $($building.actual) |")
}
$readme.Add('')

$readme.Add('## Ships')
$readme.Add('')
$readme.Add('The aliases come from the hull fiction where possible. The canonical hull name must remain visible')
$readme.Add('because ship access, costs, production, and combat all use the numeric ship type.')
$readme.Add('')
$readme.Add('| Icon | Alias | Actual |')
$readme.Add('|---|---|---|')
foreach ($ship in $catalog.ships) {
    $readme.Add("| ![$($ship.alias)](icons/$($ship.icon)) | **$($ship.alias)** | $($ship.canonical) - $($ship.actual) |")
}
$readme.Add('')

$readme.Add('## Gameplay actions')
$readme.Add('')
$readme.Add('These are the player-facing verbs currently exposed by the active game. Battle is a consequence of')
$readme.Add('movement, not a separate command, so it does not receive a misleading "attack" action icon.')
$readme.Add('')
$readme.Add('| Icon | Alias | Actual |')
$readme.Add('|---|---|---|')
foreach ($action in $catalog.actions) {
    $readme.Add("| ![$($action.alias)](icons/$($action.icon)) | **$($action.alias)** | $($action.actual) |")
}
$readme.Add('')

$readme.Add('## Asset organization')
$readme.Add('')
$readme.Add('- `catalog.json` is the machine-readable naming and mechanic map.')
$readme.Add('- `icons/` contains the 142 individual 256x256 PNGs intended for UI use.')
$readme.Add('- `atlases/` preserves the generated source sheets and their visual progression.')
$readme.Add('- `PROMPTS.md` records the built-in image-generation prompt set.')
$readme.Add('- `tools/build-icon-assets.ps1` deterministically rebuilds individual icons and this catalog from')
$readme.Add('  the source atlases.')
$readme.Add('')
$readme.Add('The PNGs have opaque command-station frames rather than transparency. This keeps small icons legible')
$readme.Add('over the existing dark UI and avoids fragile alpha edges. If the UI later needs frameless glyphs,')
$readme.Add('derive those from the individual icons as a separate production pass.')
$readme.Add('')

$readme.Add('## Verification sources')
$readme.Add('')
$readme.Add('- Research definitions: `../../../server/lib/tech.js` and its byte-identical client copy.')
$readme.Add('- Building costs and Spaceport tiers: `../../../server/server.js` and `../../../public/js/build.js`.')
$readme.Add('- Ship types and combat stats: `../../../server/lib/combat.js`.')
$readme.Add('- Player commands: `../../../docs/agents/server/websocket-protocol.md` and the active game controls.')
$readme.Add('- Fictional names: `../../24-anthology/02-hulls.md` through `../../24-anthology/10-spying.md`.')
$readme.Add('- Shared visual language: `../../../docs/art-direction/` and `../`.')

$readmePath = Join-Path $resolvedRoot 'README.md'
$encoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($readmePath, (($readme -join [Environment]::NewLine) + [Environment]::NewLine), $encoding)

Write-Output "Built $written square icons and catalog at $resolvedRoot"
