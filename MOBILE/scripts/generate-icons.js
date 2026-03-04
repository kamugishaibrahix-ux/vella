const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const source = path.join(__dirname, "../public/icons/icon-1024-source.png.png");
const outputDir = path.join(__dirname, "../public/icons");

async function generate() {
  if (!fs.existsSync(source)) {
    console.error("Source icon not found:", source);
    process.exit(1);
  }

  console.log("Generating 512x512...");
  await sharp(source)
    .resize(512, 512, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, "icon-512.png"));

  console.log("Generating 192x192...");
  await sharp(source)
    .resize(192, 192, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, "icon-192.png"));

  console.log("Generating 512x512 maskable...");

  // Resize icon to ~80% of 512 (410px) with ~20% safe zone padding
  const icon410 = await sharp(source)
    .resize(410, 410, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  // Create exact 512x512 transparent canvas, composite icon centered
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: icon410, left: 51, top: 51 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, "icon-512-maskable.png"));

  console.log("Icons generated successfully.");
}

generate();
