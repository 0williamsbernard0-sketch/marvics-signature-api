import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationStatus } from '@prisma/client';

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  async createPost(userId: string, content: string, imageUrls?: string[]) {
    return this.prisma.communityPost.create({
      data: {
        userId,
        content,
        imageUrls: imageUrls ?? [],
      },
    });
  }

  async listPosts(cursor?: string, limit = 25) {
    const posts = await this.prisma.communityPost.findMany({
      where: { status: ModerationStatus.VISIBLE },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, displayName: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }

  async addComment(postId: string, userId: string, content: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== ModerationStatus.VISIBLE) {
      throw new ForbiddenException('Cannot comment on a post that is not visible');
    }

    return this.prisma.communityComment.create({
      data: { postId, userId, content },
    });
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.communityLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await this.prisma.communityLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }

    await this.prisma.communityLike.create({ data: { postId, userId } });
    return { liked: true };
  }

  async hidePost(postId: string, adminId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    return this.prisma.communityPost.update({
      where: { id: postId },
      data: {
        status: ModerationStatus.HIDDEN,
        moderatedBy: adminId,
      },
    });
  }

  async removePost(postId: string, adminId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    return this.prisma.communityPost.update({
      where: { id: postId },
      data: {
        status: ModerationStatus.REMOVED,
        moderatedBy: adminId,
      },
    });
  }
}