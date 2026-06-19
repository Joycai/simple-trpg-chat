import * as fs from "fs";
import * as path from "path";

function getFlatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k])) {
        keys = keys.concat(getFlatKeys(obj[k] as Record<string, unknown>, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  return keys;
}

function check() {
  const enPath = path.join(process.cwd(), "messages", "en.json");
  const zhPath = path.join(process.cwd(), "messages", "zh.json");

  if (!fs.existsSync(enPath) || !fs.existsSync(zhPath)) {
    console.error("Translation files not found!");
    process.exit(1);
  }

  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const zh = JSON.parse(fs.readFileSync(zhPath, "utf-8"));

  const enKeys = new Set(getFlatKeys(en));
  const zhKeys = new Set(getFlatKeys(zh));

  let missingInZh = 0;
  let missingInEn = 0;

  for (const k of enKeys) {
    if (!zhKeys.has(k)) {
      console.error(`Missing key in zh.json: ${k}`);
      missingInZh++;
    }
  }

  for (const k of zhKeys) {
    if (!enKeys.has(k)) {
      console.error(`Missing key in en.json: ${k}`);
      missingInEn++;
    }
  }

  if (missingInZh > 0 || missingInEn > 0) {
    console.error(`\nValidation failed! ${missingInZh} missing in Chinese, ${missingInEn} missing in English.`);
    process.exit(1);
  }

  console.log("i18n validation successful! All keys are matched.");
  process.exit(0);
}

check();
