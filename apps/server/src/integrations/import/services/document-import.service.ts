import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { v7 as uuid7 } from 'uuid';
import { load } from 'cheerio';
import * as mammoth from 'mammoth';
import { imageDimensionsFromData } from 'image-dimensions';
import { markdownToHtml } from '@docmost/editor-ext';
import { StorageService } from '../../storage/storage.service';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';
import { getMimeType } from '../../../common/helpers';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const DEFAULT_IMAGE_WIDTH = 600;

interface ImportTarget {
  workspaceId: string;
  spaceId: string;
  pageId: string;
  userId: string;
}

interface UploadedImage {
  attachmentId: string;
  src: string;
  width: number;
}

/**
 * Converts uploaded .docx and .pdf files to HTML for page import. Embedded
 * images are stored as page attachments and referenced from the HTML.
 */
@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async convertDocxToHtml(
    buffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const target: ImportTarget = { workspaceId, spaceId, pageId, userId };

    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Code'] => pre:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
        ],
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const data = await image.readAsBuffer();
            const uploaded = await this.uploadImage(
              data,
              image.contentType,
              target,
            );
            return {
              src: uploaded.src,
              'data-attachment-id': uploaded.attachmentId,
              width: String(uploaded.width),
              'data-align': 'center',
              alt: (image as any).altText ?? '',
            };
          } catch (err) {
            // an unsupported or broken image must not fail the whole import
            this.logger.warn(`Skipping DOCX image: ${(err as Error).message}`);
            return { src: '' };
          }
        }),
      },
    );

    if (!result.value?.trim()) {
      throw new BadRequestException('The Word document has no readable content.');
    }

    // drop images that could not be stored
    const $ = load(result.value);
    $('img').each((_, el) => {
      if (!$(el).attr('src')) $(el).remove();
    });
    return $('body').html() ?? '';
  }

  async convertPdfToHtml(
    buffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const target: ImportTarget = { workspaceId, spaceId, pageId, userId };
    // loaded lazily so the server still boots where the native binding is unavailable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { processPdfWithImages } = require('@docmost/pdf-inspector');

    const result = processPdfWithImages(buffer);
    let markdown: string = result.markdown ?? '';

    if (!markdown.trim()) {
      throw new BadRequestException(
        'No text could be extracted from this PDF. Scanned or image-only PDFs are not supported.',
      );
    }

    const uploaded = new Map<number, UploadedImage>();
    for (let i = 0; i < (result.images?.length ?? 0); i++) {
      const placeholder = `pdf-image://${i}`;
      if (!markdown.includes(placeholder)) continue;
      const img = result.images[i];
      try {
        const mime = img.format === 'Png' ? 'image/png' : 'image/jpeg';
        uploaded.set(i, await this.uploadImage(Buffer.from(img.data), mime, target));
      } catch (err) {
        this.logger.warn(`Skipping PDF image ${i}: ${(err as Error).message}`);
      }
    }

    // swap placeholders for stored files; unstored images are removed
    markdown = markdown.replace(
      /!\[[^\]]*\]\(pdf-image:\/\/(\d+)\)/g,
      (_, idx) => {
        const img = uploaded.get(Number(idx));
        return img ? `![image](${img.src})` : '';
      },
    );

    const html = await markdownToHtml(markdown);

    const $ = load(html);
    $('img').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      const match = [...uploaded.values()].find((u) => u.src === src);
      if (!match) return;
      $(el)
        .attr('data-attachment-id', match.attachmentId)
        .attr('width', String(match.width))
        .attr('data-align', 'center');
    });
    return $('body').html() ?? '';
  }

  private async uploadImage(
    data: Buffer,
    contentType: string,
    target: ImportTarget,
  ): Promise<UploadedImage> {
    const ext = IMAGE_EXTENSIONS[(contentType ?? '').toLowerCase()];
    if (!ext) {
      throw new Error(`unsupported image type ${contentType}`);
    }

    const attachmentId = uuid7();
    const fileName = `image.${ext}`;
    const filePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      target.workspaceId,
    )}/${attachmentId}/${fileName}`;

    await this.storageService.upload(filePath, data);

    await this.db
      .insertInto('attachments')
      .values({
        id: attachmentId,
        filePath,
        fileName,
        fileSize: data.length,
        mimeType: getMimeType(fileName),
        type: 'file',
        fileExt: `.${ext}`,
        creatorId: target.userId,
        workspaceId: target.workspaceId,
        pageId: target.pageId,
        spaceId: target.spaceId,
      })
      .execute();

    let width = DEFAULT_IMAGE_WIDTH;
    try {
      const natural = imageDimensionsFromData(new Uint8Array(data));
      if (natural?.width) width = Math.min(natural.width, 900);
    } catch {
      /* keep the default width */
    }

    return {
      attachmentId,
      src: `/api/files/${attachmentId}/${fileName}`,
      width,
    };
  }
}
