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
    filename: (_req, file, cb) => {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

      cb(null, randName(file.originalname))
    },
  }),

  fileFilter: (req: any, file: MulterFile, cb: Function) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(null, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
};

export const categoryIconOptions = {
  storage: diskStorage({
    destination: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'), '');
      const dir = join(process.cwd(), 'uploads', 'category-icons');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

      cb(null, randName(file.originalname))
    },
  }),
  fileFilter: (req: any, file: MulterFile, cb: Function) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
};


const IMG_RE = /^image\/(jpeg|png|jpg|gif|webp|svg\+xml)$/;

export const logoUploadOptions = {
  storage: diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'siteLogo');
      await ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');


      const ext = file.originalname.split('.').pop();
      const filename = `siteLogo-${Date.now()}.${ext}`;
      cb(null, filename);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (IMG_RE.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
};