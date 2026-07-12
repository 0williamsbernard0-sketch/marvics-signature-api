import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UserRole } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
}

@Controller('community')
export class CommunityController {
  constructor(private communityService: CommunityService) {}

  @Get('posts')
  async listPosts(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.communityService.listPosts(cursor, limit ? parseInt(limit, 10) : undefined);
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async createPost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.communityService.createPost(user.id, dto.content, dto.imageUrls);
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async addComment(
    @Param('id') postId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.addComment(postId, user.id, dto.content);
  }

  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(@Param('id') postId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.communityService.toggleLike(postId, user.id);
  }
}

@Controller('admin/community')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityAdminController {
  constructor(private communityService: CommunityService) {}

  @Post('posts/:id/hide')
  @Roles(UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  async hidePost(@Param('id') postId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.communityService.hidePost(postId, admin.id);
  }

  @Delete('posts/:id')
  @Roles(UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  async removePost(@Param('id') postId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.communityService.removePost(postId, admin.id);
  }
}