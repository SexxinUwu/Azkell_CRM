const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Run test_full_tv_feed twice in one script to check cache speed
async function testCache() {
    const start = Date.now();
    require('./scratch/test_full_tv_feed.js');
}
