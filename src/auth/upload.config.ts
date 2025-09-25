// src/upload/upload.config.ts
import { diskStorage } from 'multer';
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

const IMG_RE = /^image\/(jpeg|png|jpg|gif|webp|svg\+xml)$/;
const VID_RE = /^video\/(mp4|quicktime|x-matroska|webm|x-msvideo)$/;

export const imageUploadOptions = {
  storage: diskStorage({
    destination: (_req, file, cb) => {
      if (!IMG_RE.test(file.mimetype)) return cb(new Error('Only image files allowed'), '');
      const dir = join(process.cwd(), 'uploads', 'images');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randName(file.originalname)),
  }),
  fileFilter: (_req, file, cb) => (IMG_RE.test(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported image type'), false)),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB images
};

export const videoUploadOptions = {
  storage: diskStorage({
    destination: (_req, file, cb) => {
      if (!VID_RE.test(file.mimetype)) return cb(new Error('Only video files allowed'), '');
      const dir = join(process.cwd(), 'uploads', 'videos');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randName(file.originalname)),
  }),
  fileFilter: (_req, file, cb) => (VID_RE.test(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported video type'), false)),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB videos
};

// Allow common document types
const DOC_RE = /^(application\/pdf|text\/plain|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation)$/i;

export const fileUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', 'files');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randName(file.originalname)),
  }),
  fileFilter: (_req, file, cb) => (DOC_RE.test(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported document type'), false)),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
};
