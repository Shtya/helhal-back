// src/upload/upload.config.ts
import { diskStorage, File as MulterFile } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException, CallHandler, CanActivate, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from 'entities/global.entity';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';

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

export interface FileRequest extends Request {
  user: { id: string };
  files?: MulterFile[];
  remainingUploadSlots?: number; // ✅ add this property
}


@Injectable()
export class CalculateRemainingImagesInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) { }

  async intercept(context: ExecutionContext, next: CallHandler<any>): Promise<Observable<any>> {
    const req: FileRequest = context.switchToHttp().getRequest();

    if (!req.user?.id) {
      req.remainingUploadSlots = 0;
      return next.handle();
    }

    const user = await this.usersRepo.findOne({ where: { id: req.user.id } });
    const currentCount = Array.isArray(user?.portfolioItems) ? user.portfolioItems.length : 0;
    const maxFiles = 6;
    req.remainingUploadSlots = Math.max(maxFiles - currentCount, 0);

    return next.handle();
  }
}

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

  fileFilter: (req: any, file: MulterFile, cb: Function) => {
    // First, check if this is a valid image
    if (!IMG_RE.test(file.mimetype)) {
      return cb(null, false); // do not throw
    }

    if (typeof req.remainingUploadSlots !== 'number') {
      return cb(null, false);
    }

    // If there are remaining slots, accept file and decrease counter
    if (req.remainingUploadSlots > 0) {
      req.remainingUploadSlots--; // decrease for this file
      return cb(null, true);
    }

    // No remaining slots: skip this file silently
    return cb(null, false);
  },
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
  fileFilter: (_req, file, cb) => (VID_RE.test(file.mimetype) ? cb(null, true) : cb(null, false)),
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
  fileFilter: (_req, file, cb) => (DOC_RE.test(file.mimetype) ? cb(null, true) : cb(null, false)),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
};
