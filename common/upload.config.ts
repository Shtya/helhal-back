import { diskStorage, File as MulterFile } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function randName(original: string) {
  const ext = extname(original);
  const rand = Array(16)
    .fill(null)
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('');
  return `${Date.now()}-${rand}${ext}`;
}

export const serviceIconOptions = {
  storage: diskStorage({
    destination: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed as service ico'), '');
      const dir = join(process.cwd(), 'uploads', 'service-icons');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randName(file.originalname)),
  }),

  fileFilter: (req: any, file: MulterFile, cb: Function) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(null, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
};