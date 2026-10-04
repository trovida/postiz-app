import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media'>) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
      },
    });
  }

  startProcessing(org: string, id: string) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: { status: 'processing', processingError: null },
      select: { id: true, status: true },
    });
  }

  finishProcessing(
    org: string,
    id: string,
    data: { name?: string; path?: string; fileSize?: number; error?: string }
  ) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.path ? { path: data.path } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        status: data.error ? 'failed' : 'ready',
        processingError: data.error || null,
      },
      select: { id: true, status: true },
    });
  }

  getMediaStatus(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  // Ownership-scoped lookup: only returns the row if it belongs to this org
  // and is not soft-deleted. Used by features that act on a user's own media.
  getMediaByIdForOrg(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        path: true,
        status: true,
      },
    });
  }

  // Same, keyed by the stored public path — for callers that only have the URL
  // (e.g. the chat agent reading an image URL from the message text).
  getMediaByPathForOrg(org: string, path: string) {
    return this._media.model.media.findFirst({
      where: {
        path,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        path: true,
        status: true,
      },
    });
  }

  // --- Pillar A / #1: content analysis (auto-tagged library + mix audit) ---

  updateAiAnalysis(
    id: string,
    data: {
      aiCategory: string;
      aiDescription: string;
      aiLabels: string;
      aiModel: string;
    }
  ) {
    return this._media.model.media.update({
      where: { id },
      data: { ...data, aiAnalyzedAt: new Date() },
      select: {
        id: true,
        aiCategory: true,
        aiDescription: true,
        aiLabels: true,
        aiAnalyzedAt: true,
      },
    });
  }

  // Images not yet analyzed, or analyzed by a different model (so a model
  // change re-analyzes). Oldest-first? No — newest-first (most relevant).
  findUnanalyzedForOrg(org: string, model: string, limit: number) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        type: 'image',
        OR: [{ aiAnalyzedAt: null }, { aiModel: { not: model } }],
      },
      select: { id: true, path: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Mix distribution over the analyzed library.
  getAnalyzedCategories(org: string) {
    return this._media.model.media.groupBy({
      by: ['aiCategory'],
      where: {
        organizationId: org,
        deletedAt: null,
        aiCategory: { not: null },
      },
      _count: { _all: true },
    });
  }

  // Copy the AI alt-text into the (accessibility) alt field — one-click.
  async applyAiAlt(org: string, id: string) {
    const m = await this._media.model.media.findFirst({
      where: { id, organizationId: org, deletedAt: null },
      select: { aiDescription: true },
    });
    if (!m?.aiDescription) {
      return { applied: false as const };
    }
    await this._media.model.media.update({
      where: { id },
      data: { alt: m.aiDescription },
    });
    return { applied: true as const, alt: m.aiDescription };
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, search?: string) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    // Search by what's IN the photo (Pillar A), not just the filename: match
    // the AI description + labels as well as the original name.
    const searchFilter = trimmedSearch
      ? {
          OR: [
            {
              originalName: {
                contains: trimmedSearch,
                mode: 'insensitive' as const,
              },
            },
            {
              aiDescription: {
                contains: trimmedSearch,
                mode: 'insensitive' as const,
              },
            },
            {
              aiLabels: {
                contains: trimmedSearch,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};
    const query = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null,
        status: { not: 'processing' },
        ...searchFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        // still being normalized: it shows up once the workflow releases it
        status: { not: 'processing' },
        ...searchFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        aiCategory: true,
        aiLabels: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}
