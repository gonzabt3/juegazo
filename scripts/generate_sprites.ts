import fs from 'node:fs';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';

const CONTRACT = {
  canvas: { width: 1024, height: 896 },
  grid: { cols: 8, rows: 7, cellW: 128, cellH: 128 },
  anchor: { x: 64, y: 122 },
  clips: {
    IDLE: { row: 0, frameCount: 6, fps: 8, loop: true },
    MOVING: { row: 1, frameCount: 8, fps: 12, loop: true },
    JUMPING: { row: 2, frameCount: 4, fps: 10, loop: false },
    ATTACKING: { row: 3, frameCount: 6, fps: 14, loop: false },
    KICKING: { row: 4, frameCount: 6, fps: 14, loop: false },
    BLOCKING: { row: 5, frameCount: 2, fps: 6, loop: true },
    HIT: { row: 6, frameCount: 3, fps: 12, loop: false },
  },
} as const;

type ClipName = keyof typeof CONTRACT.clips;

interface ParsedArgs {
  filePath: string;
  name: string;
}

interface ValidationResult {
  pass: boolean;
  issues: string[];
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const first = args[0] || '';

  // Optional shorthand: generate_sprite file:://../character.png nombre:gonzalo
  if (first.startsWith('file://') || first.startsWith('file:://')) {
    const filePath = normalizeFileArg(first);
    const nameArg = args.find((v) => v.startsWith('name:') || v.startsWith('nombre:'));
    const name = (nameArg?.split(':')[1] || '').trim();
    if (!filePath || !name) {
      throw new Error('Uso: npm run generate_sprite -- --file ./character.png --name gonzalo');
    }
    return { filePath, name };
  }

  const getFlag = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const rawFile = getFlag('--file');
  const name = getFlag('--name') || getFlag('--nombre');
  if (!rawFile || !name) {
    throw new Error('Uso: npm run generate_sprite -- --file ./character.png --name gonzalo');
  }

  return {
    filePath: normalizeFileArg(rawFile),
    name: sanitizeName(name),
  };
}

function normalizeFileArg(value: string): string {
  if (value.startsWith('file:://')) {
    return path.resolve(value.replace('file:://', ''));
  }

  if (value.startsWith('file://')) {
    try {
      const url = new URL(value);
      return path.resolve(decodeURIComponent(url.pathname));
    } catch {
      return path.resolve(value.replace('file://', ''));
    }
  }

  return path.resolve(value);
}

function sanitizeName(name: string): string {
  const normalized = name.trim().toLowerCase();
  const clean = normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

  if (!clean) {
    throw new Error('El nombre del personaje es invalido.');
  }

  return clean;
}

async function prepareReference(sourcePath: string, targetPath: string): Promise<void> {
  await sharp(sourcePath)
    .resize(768, 768, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(targetPath);
}

async function describeCharacter(client: OpenAI, imagePath: string): Promise<string> {
  const raw = fs.readFileSync(imagePath);
  const b64 = raw.toString('base64');

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${b64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text:
              'Describe this character for a side-view 2D fighting game sprite. Include: body build, hair style/color, skin tone, outfit pieces, accessory details, and color palette. Keep it concise and specific.',
          },
        ],
      },
    ],
    max_tokens: 240,
  });

  return response.choices[0]?.message?.content?.trim() || 'generic fighting game character';
}

function buildPrompt(characterName: string, characterDescription: string): string {
  return [
    `Generate one PNG spritesheet for a 2D fighting game character named "${characterName}".`,
    `Character appearance reference: ${characterDescription}`,
    '',
    'Technical output contract (strict):',
    '- Transparent background only (alpha=0 where no character pixels exist).',
    '- Exact canvas size: 1024x896 pixels.',
    '- Exact grid: 8 columns x 7 rows.',
    '- Every cell exactly 128x128 pixels, no margins, no padding around the whole sheet.',
    '- Side view, facing right, clean game-ready style, crisp edges, no motion blur.',
    '',
    'Row mapping:',
    '- Row 0: IDLE, 6 frames (cols 0..5), cols 6..7 fully transparent.',
    '- Row 1: MOVING, 8 frames (cols 0..7).',
    '- Row 2: JUMPING, 4 frames (cols 0..3), cols 4..7 fully transparent.',
    '- Row 3: ATTACKING, 6 frames (cols 0..5), cols 6..7 fully transparent.',
    '- Row 4: KICKING, 6 frames (cols 0..5), cols 6..7 fully transparent.',
    '- Row 5: BLOCKING, 2 frames (cols 0..1), cols 2..7 fully transparent.',
    '- Row 6: HIT, 3 frames (cols 0..2), cols 3..7 fully transparent.',
    '',
    'Animation quality constraints:',
    '- Keep character fully inside each 128x128 frame.',
    '- Feet aligned to the same baseline in all non-jump rows.',
    '- Stable head and torso size across all frames.',
    '- Consistent outfit and face details across all frames.',
    '- No extra limbs, no duplicate body parts, no deformed hands/fingers.',
    '- No text, logo, watermark, background clutter.',
  ].join('\n');
}

async function generateSheet(client: OpenAI, referencePath: string, prompt: string, rawOutPath: string): Promise<void> {
  const image = await toFile(fs.readFileSync(referencePath), 'reference.png', { type: 'image/png' });

  const response = await client.images.edit({
    model: 'gpt-image-1',
    image,
    prompt,
    size: '1024x1024',
    quality: 'high',
  });

  const first = response.data[0];
  if (!first) {
    throw new Error('La API de imagen no devolvio resultados.');
  }

  if (first.b64_json) {
    fs.writeFileSync(rawOutPath, Buffer.from(first.b64_json, 'base64'));
    return;
  }

  if (first.url) {
    const downloaded = await fetch(first.url);
    if (!downloaded.ok) {
      throw new Error(`Fallo descarga de imagen: HTTP ${downloaded.status}`);
    }
    const buf = Buffer.from(await downloaded.arrayBuffer());
    fs.writeFileSync(rawOutPath, buf);
    return;
  }

  throw new Error('La API no devolvio b64_json ni url para la imagen.');
}

async function normalizeToContract(rawPath: string, outPath: string): Promise<void> {
  await sharp(rawPath)
    .ensureAlpha()
    .resize(CONTRACT.canvas.width, CONTRACT.canvas.height, {
      fit: 'fill',
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toFile(outPath);
}

function rgbaIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function getBounds(
  data: Buffer<ArrayBufferLike>,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): { minX: number; minY: number; maxX: number; maxY: number; opaque: number } | null {
  let minX = x0 + w;
  let minY = y0 + h;
  let maxX = x0 - 1;
  let maxY = y0 - 1;
  let opaque = 0;

  const maxXc = Math.min(width, x0 + w);
  const maxYc = Math.min(height, y0 + h);

  for (let y = y0; y < maxYc; y++) {
    for (let x = x0; x < maxXc; x++) {
      const a = data[rgbaIndex(x, y, width) + 3];
      if (a <= 10) continue;
      opaque += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (opaque === 0) return null;
  return { minX, minY, maxX, maxY, opaque };
}

function expectedUsedFrames(clipName: ClipName): number {
  return CONTRACT.clips[clipName].frameCount;
}

async function validateSheet(sheetPath: string): Promise<ValidationResult> {
  const issues: string[] = [];

  const { data, info } = await sharp(sheetPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  if (width !== CONTRACT.canvas.width || height !== CONTRACT.canvas.height) {
    issues.push(`canvas invalido: ${width}x${height}, esperado ${CONTRACT.canvas.width}x${CONTRACT.canvas.height}`);
    return { pass: false, issues };
  }

  const rowNames = Object.keys(CONTRACT.clips) as ClipName[];

  for (const rowName of rowNames) {
    const clip = CONTRACT.clips[rowName];
    const usedFrames = expectedUsedFrames(rowName);

    for (let col = 0; col < CONTRACT.grid.cols; col++) {
      const x0 = col * CONTRACT.grid.cellW;
      const y0 = clip.row * CONTRACT.grid.cellH;
      const bounds = getBounds(data, width, height, x0, y0, CONTRACT.grid.cellW, CONTRACT.grid.cellH);

      if (col < usedFrames) {
        if (!bounds) {
          issues.push(`${rowName}[${col}] vacio`);
          continue;
        }

        if (bounds.opaque < 220) {
          issues.push(`${rowName}[${col}] con pocos pixeles opacos (${bounds.opaque})`);
        }

        const relMinX = bounds.minX - x0;
        const relMinY = bounds.minY - y0;
        const relMaxX = bounds.maxX - x0;
        const relMaxY = bounds.maxY - y0;

        if (relMinX <= 1 || relMinY <= 1 || relMaxX >= CONTRACT.grid.cellW - 2 || relMaxY >= CONTRACT.grid.cellH - 2) {
          issues.push(`${rowName}[${col}] toca bordes de la celda (posible recorte)`);
        }
      } else if (bounds && bounds.opaque > 16) {
        issues.push(`${rowName}[${col}] deberia ser transparente y tiene ${bounds.opaque} px opacos`);
      }
    }
  }

  // Baseline check on non-jump rows.
  const baselineRows: ClipName[] = ['IDLE', 'MOVING', 'ATTACKING', 'KICKING', 'BLOCKING', 'HIT'];
  for (const rowName of baselineRows) {
    const clip = CONTRACT.clips[rowName];
    const footYs: number[] = [];

    for (let col = 0; col < clip.frameCount; col++) {
      const x0 = col * CONTRACT.grid.cellW;
      const y0 = clip.row * CONTRACT.grid.cellH;
      const bounds = getBounds(data, width, height, x0, y0, CONTRACT.grid.cellW, CONTRACT.grid.cellH);
      if (!bounds) continue;
      footYs.push(bounds.maxY - y0);
    }

    if (footYs.length < 2) continue;
    const min = Math.min(...footYs);
    const max = Math.max(...footYs);
    if (max - min > 6) {
      issues.push(`${rowName} baseline inestable (delta ${max - min}px)`);
    }
  }

  return { pass: issues.length === 0, issues };
}

function writeConfig(outputDir: string): void {
  const config = {
    imageUrl: './spritesheet.png',
    sourceFrameWidth: CONTRACT.grid.cellW,
    sourceFrameHeight: CONTRACT.grid.cellH,
    sourceOriginX: 0,
    sourceOriginY: 0,
    sourceStrideX: CONTRACT.grid.cellW,
    sourceStrideY: CONTRACT.grid.cellH,
    renderWidth: CONTRACT.grid.cellW,
    renderHeight: CONTRACT.grid.cellH,
    columns: CONTRACT.grid.cols,
    rows: CONTRACT.grid.rows,
    anchor: CONTRACT.anchor,
    clips: CONTRACT.clips,
  };

  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function writeReport(outputDir: string, validation: ValidationResult): void {
  const reportPath = path.join(outputDir, 'validation.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        pass: validation.pass,
        issues: validation.issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

async function main(): Promise<void> {
  const { filePath, name } = parseArgs();

  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontro la imagen en: ${filePath}`);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY en el entorno.');
  }

  const outputDir = path.join(process.cwd(), 'src', 'assets', name);
  fs.mkdirSync(outputDir, { recursive: true });

  const referencePath = path.join(outputDir, '_reference.png');
  const rawSheetPath = path.join(outputDir, '_raw.png');
  const finalSheetPath = path.join(outputDir, 'spritesheet.png');

  const client = new OpenAI({ apiKey });

  console.log(`Generando sprites para: ${name}`);
  console.log(`Entrada: ${filePath}`);

  await prepareReference(filePath, referencePath);
  console.log('Referencia preparada.');

  const description = await describeCharacter(client, referencePath);
  console.log(`Descripcion detectada: ${description}`);

  const prompt = buildPrompt(name, description);
  await generateSheet(client, referencePath, prompt, rawSheetPath);
  console.log('Imagen base generada por gpt-image-1.');

  await normalizeToContract(rawSheetPath, finalSheetPath);
  console.log(`Spritesheet normalizado a ${CONTRACT.canvas.width}x${CONTRACT.canvas.height}.`);

  const validation = await validateSheet(finalSheetPath);
  writeConfig(outputDir);
  writeReport(outputDir, validation);

  // Requested behavior: keep result and warn on validation failures.
  if (validation.pass) {
    console.log('Validacion: OK');
  } else {
    console.warn('Validacion: con observaciones.');
    validation.issues.forEach((issue) => console.warn(` - ${issue}`));
  }

  // Keep intermediate files out of final asset folder.
  try {
    fs.unlinkSync(referencePath);
  } catch {
    // no-op
  }
  try {
    fs.unlinkSync(rawSheetPath);
  } catch {
    // no-op
  }

  console.log('Archivos generados:');
  console.log(` - ${path.relative(process.cwd(), finalSheetPath)}`);
  console.log(` - ${path.relative(process.cwd(), path.join(outputDir, 'config.json'))}`);
  console.log(` - ${path.relative(process.cwd(), path.join(outputDir, 'validation.json'))}`);
}

main().catch((error: unknown) => {
  console.error('Error al generar sprites:', error instanceof Error ? error.message : error);
  process.exit(1);
});
