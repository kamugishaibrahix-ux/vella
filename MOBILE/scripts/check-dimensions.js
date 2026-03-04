const sharp = require("sharp");
const path = require("path");

const iconsDir = path.join(__dirname, "../public/icons");

async function checkDimensions() {
  const files = [
    { name: "icon-512.png", expected: [512, 512] },
    { name: "icon-192.png", expected: [192, 192] },
    { name: "icon-512-maskable.png", expected: [512, 512] },
  ];

  console.log("[check-dimensions] Verifying generated icons...\n");

  for (const file of files) {
    const filePath = path.join(iconsDir, file.name);
    const metadata = await sharp(filePath).metadata();
    const pass = metadata.width === file.expected[0] && metadata.height === file.expected[1];
    console.log(`${file.name} = ${metadata.width}x${metadata.height} ${pass ? "✓" : "✗"}`);
    console.log(`  format: ${metadata.format}, alpha: ${metadata.hasAlpha}, channels: ${metadata.channels}\n`);
  }

  console.log("[check-dimensions] Verification complete.");
}

checkDimensions().catch((err) => {
  console.error("[check-dimensions] Error:", err);
  process.exit(1);
});
