/**
 * create-placeholders.js - Generate placeholder images for missing assets
 */

const fs = require('fs');
const path = require('path');

// Create a simple SVG placeholder
function createPlaceholderSVG(text, width = 100, height = 100, color = '#444') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${color}" stroke="#666" stroke-width="2"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" 
          font-family="Arial" font-size="14" fill="#fff">${text}</text>
</svg>`;
}

// Define placeholder images to create
const placeholders = [
    // Ship sprites
    { file: '../ship1.png', text: 'Scout', color: '#2a52be' },
    { file: '../ship2.png', text: 'Frigate', color: '#4a5f8e' },
    { file: '../ship3.png', text: 'Destroyer', color: '#5a6f9e' },
    { file: '../ship4.png', text: 'Cruiser', color: '#6a7fae' },
    { file: '../ship5.png', text: 'Battleship', color: '#7a8fbe' },
    { file: '../ship6.png', text: 'Colony', color: '#8a9fce' },
    { file: '../ship7.png', text: 'Dreadnought', color: '#9aafde' },
    { file: '../ship8.png', text: 'Intruder', color: '#444444' },
    { file: '../ship9.png', text: 'Carrier', color: '#aabfee' },
    
    // Animated ships (use same as static for now)
    { file: '../ship1.gif', text: 'Scout', color: '#2a52be' },
    { file: '../ship2.gif', text: 'Frigate', color: '#4a5f8e' },
    { file: '../ship3.gif', text: 'Destroyer', color: '#5a6f9e' },
    { file: '../ship4.gif', text: 'Cruiser', color: '#6a7fae' },
    { file: '../ship5.gif', text: 'Battleship', color: '#7a8fbe' },
    { file: '../ship6.gif', text: 'Colony', color: '#8a9fce' },
    
    // Effects
    { file: '../boom.gif', text: 'BOOM', color: '#ff4444' },
    { file: '../boom3.gif', text: 'BOOM', color: '#ff6644' },
    { file: '../ground.gif', text: 'Ground', color: '#8B4513' },
    { file: '../orbital.gif', text: 'Orbital', color: '#4169E1' },
    
    // UI elements
    { file: '../base.png', text: 'Base', color: '#556B2F' },
    { file: '../base1.png', text: 'Base1', color: '#6B8E23' },
    { file: '../base2.png', text: 'Base2', color: '#8FBC8F' },
    { file: '../waveform.gif', text: 'Wave', color: '#00CED1' },
    
    // Backgrounds
    { file: '../spacebak.jpg', text: 'Space', width: 800, height: 600, color: '#000033' },
    { file: '../topbar.jpg', text: 'Top Bar', width: 800, height: 50, color: '#222222' },
    { file: '../title.jpg', text: 'Game of Worlds', width: 600, height: 200, color: '#1a1a3a' },
    { file: '../title.png', text: 'Game of Worlds', width: 600, height: 200, color: '#1a1a3a' },
    { file: '../title2.jpg', text: 'Game of Worlds', width: 600, height: 200, color: '#2a2a4a' },
    { file: '../title2.png', text: 'Game of Worlds', width: 600, height: 200, color: '#2a2a4a' },
    
    // Sector types
    { file: '../type0.gif', text: 'Empty', color: '#000000' },
    { file: '../type00.gif', text: 'Empty', color: '#000000' },
    { file: '../type1.gif', text: 'Asteroid', color: '#8B7355' },
    { file: '../type2.gif', text: 'Black Hole', color: '#2F4F4F' },
    { file: '../type3.gif', text: 'Unstable', color: '#FF6347' },
    { file: '../type4.gif', text: 'Brown Dwarf', color: '#8B4513' },
    { file: '../type5.gif', text: 'Small Moon', color: '#C0C0C0' },
    { file: '../type6.gif', text: 'Micro Planet', color: '#DAA520' },
    { file: '../type7.gif', text: 'Small Planet', color: '#3CB371' },
    { file: '../type8.gif', text: 'Medium Planet', color: '#4682B4' },
    { file: '../type9.gif', text: 'Large Planet', color: '#6495ED' },
    { file: '../type10.gif', text: 'Homeworld', color: '#FFD700' },
    
    // Resources
    { file: '../metal.png', text: 'Metal', color: '#708090' },
    { file: '../crystal.png', text: 'Crystal', color: '#E0FFFF' },
    { file: '../resources.png', text: 'Resources', width: 200, height: 100, color: '#4B0082' },
    { file: '../research.png', text: 'Research', color: '#9370DB' },
    
    // Other UI elements
    { file: '../playerstats.jpg', text: 'Stats', width: 200, height: 300, color: '#2F4F4F' },
    { file: '../tutorial.jpg', text: 'Tutorial', width: 600, height: 400, color: '#483D8B' },
    { file: '../buygold.jpg', text: 'Buy Gold', width: 200, height: 100, color: '#FFD700' },
    { file: '../mapleftside.png', text: 'Map Side', width: 50, height: 400, color: '#1a1a1a' },
    { file: '../topofmap.png', text: 'Map Top', width: 800, height: 50, color: '#1a1a1a' },
    { file: '../minilogo.png', text: 'GoW', width: 50, height: 50, color: '#4169E1' },
    
    // Platform icons
    { file: '../android.png', text: 'Android', width: 50, height: 50, color: '#3DDC84' },
    { file: '../apple.png', text: 'iOS', width: 50, height: 50, color: '#000000' },
    { file: '../chrome.png', text: 'Chrome', width: 50, height: 50, color: '#4285F4' },
    { file: '../html5_logo.png', text: 'HTML5', width: 50, height: 50, color: '#E34C26' },
    
    // Ships in rewrite folder
    { file: '../interceptor.png', text: 'Interceptor', color: '#FF1493' },
    { file: '../dreadnaught.png', text: 'Dreadnaught', color: '#8B008B' },
    { file: '../planet1.png', text: 'P1', color: '#228B22' },
    { file: '../planet2.png', text: 'P2', color: '#32CD32' },
    { file: '../planet3.png', text: 'P3', color: '#00FF00' },
    { file: '../planet4.png', text: 'P4', color: '#7FFF00' },
    { file: '../planet5.png', text: 'P5', color: '#7CFC00' },
    { file: '../planet6.png', text: 'P6', color: '#ADFF2F' },
    { file: '../planet7.png', text: 'P7', color: '#9ACD32' },
    { file: '../planet8.png', text: 'P8', color: '#6B8E23' },
    { file: '../planet9.png', text: 'P9', color: '#556B2F' },
    { file: '../planet10.png', text: 'P10', color: '#8FBC8F' },
    
    // Other assets
    { file: '../sample.jpg', text: 'Sample', width: 400, height: 300, color: '#696969' },
    { file: '../ext.jpg', text: 'Ext', color: '#A52A2A' },
    { file: '../avatar1.jpg', text: 'Avatar', color: '#FF69B4' },
    { file: '../probe.png', text: 'Probe', color: '#00FFFF' },
    { file: '../bubblebox.png', text: 'BubbleBox', width: 200, height: 100, color: '#FF1493' }
];

// Create placeholders
console.log('Creating placeholder images...');

placeholders.forEach(({ file, text, width = 100, height = 100, color }) => {
    const filePath = path.join(__dirname, file);
    const svg = createPlaceholderSVG(text, width, height, color);
    
    // For now, save SVG files with the expected extensions
    // In production, these would be converted to actual PNG/JPG/GIF files
    fs.writeFileSync(filePath, svg, 'utf8');
    console.log(`Created: ${file}`);
});

console.log('All placeholder images created!');