const fs = require('fs');
const path = require('path');

const srcIcon = path.join(__dirname, 'marsisa_logo.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const dirs = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

dirs.forEach(d => {
    const targetDir = path.join(resDir, d);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    
    fs.copyFileSync(srcIcon, path.join(targetDir, 'ic_launcher.png'));
    fs.copyFileSync(srcIcon, path.join(targetDir, 'ic_launcher_round.png'));
    fs.copyFileSync(srcIcon, path.join(targetDir, 'ic_launcher_foreground.png'));
});

// TV Banner and Splash
const drawableDir = path.join(resDir, 'drawable');
if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });

fs.copyFileSync(srcIcon, path.join(drawableDir, 'tv_banner.png'));
fs.copyFileSync(srcIcon, path.join(drawableDir, 'splash.png'));

// Also copy to root as marsisa_logo.png
fs.copyFileSync(srcIcon, path.join(__dirname, '..', 'marsisa_logo.png'));

console.log('✅ Official Marsisa logo applied to all icon and banner locations!');
