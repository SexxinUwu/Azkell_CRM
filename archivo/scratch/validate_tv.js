const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testEndpoint() {
    console.log('Testing TV HTML syntax and structure...');
    const fs = require('fs');
    const html = fs.readFileSync('./tv.html', 'utf8');
    console.log('HTML size:', html.length, 'bytes');
    console.log('Contains Leaflet:', html.includes('leaflet.js'));
    console.log('Contains 4 views:', html.includes('viewGps') && html.includes('viewOt') && html.includes('viewBacklog') && html.includes('viewFallas'));
    console.log('Contains OpenStreetMap:', html.includes('tile.openstreetmap.org'));
    console.log('Contains Google Satellite:', html.includes('mt1.google.com/vt/lyrs=y'));
    console.log('Contains Light Mode palette:', html.includes('#f1f5f9') && html.includes('#ffffff'));
}

testEndpoint().catch(console.error);
