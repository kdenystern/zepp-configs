// sharp, set up to draw SVG text with the bundled DejaVu fonts so output does
// not depend on what fonts the machine has. Import sharp only through here.
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fontConfig = join(tmpdir(), 'zepp-apps-fonts.conf')
writeFileSync(
  fontConfig,
  `<?xml version="1.0"?><fontconfig><dir>${join(root, 'node_modules/dejavu-fonts-ttf/ttf')}</dir><cachedir>${join(tmpdir(), 'zepp-apps-fontcache')}</cachedir></fontconfig>`,
)
// fontconfig reads this when sharp first loads, hence the dynamic import.
process.env.FONTCONFIG_FILE = fontConfig

export const { default: sharp } = await import('sharp')
