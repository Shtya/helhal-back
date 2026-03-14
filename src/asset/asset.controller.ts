import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Req,
  Body,
  Delete,
  Param,
  Get,
  Patch,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'common/multer.config';
import { CreateAssetDto, UpdateAssetDto } from 'dto/assets.dto';
import { AssetService } from './asset.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { AccessGuard } from 'src/auth/guard/access.guard';
import { TranslationService } from 'common/translation.service';

@UseGuards(JwtAuthGuard, AccessGuard)
@Controller('assets')
export class AssetController {
  constructor(
    private readonly assetService: AssetService,
    private readonly i18n: TranslationService,
  ) { }

  // ✅ Single asset upload
  @Post()
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async upload(
    @UploadedFile() file: any,
    @Body() dto: CreateAssetDto,
    @Req() req: any,
  ) {
    return this.assetService.Create(dto, file, req.user);
  }

  @Post('bulk')
  @UseInterceptors(FilesInterceptor('files', 20, multerOptions))
  async uploadMultiple(
    @UploadedFiles() files: any[],
    @Body() dto: CreateAssetDto,
    @Req() req: any,
  ) {
    if (!files?.length) throw new NotFoundException(this.i18n.t('events.asset.no_files_uploaded'));

    const assets = await Promise.all(
      files.map((file) => this.assetService.Create(dto, file, req.user)),
    );

    return {
      message: this.i18n.t('events.asset.upload_success'),
      assets,
    };
  }

  @Get()
  async getUserAssets(@Req() req: any, @Query() query) {
    const { page, limit, search, sortBy, category, type, sortOrder } = query;
    return this.assetService.findAll(
      'files',
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      ['user'], // relations
      ['url', 'filename', 'mimeType'],
      { user: { id: req.user.id }, category, type },
    );
  }

  @Get(':id')
  async getAsset(@Param('id') id: string) {
    return this.assetService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async updateAsset(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetService.update(id, dto, file);
  }

  // @Delete(':id')
  // async deleteAsset(@Param('id') id: string) {
  //   return this.assetService.delete(id);
  // }
}
