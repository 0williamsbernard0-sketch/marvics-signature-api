import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { TicketStatus, UserRole } from '@prisma/client';

const AGENT_ROLES = [UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN];

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private support: SupportService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user.id, dto.subject, dto.body);
  }

  @Get()
  listOwn(@CurrentUser() user: any) {
    return this.support.listOwnTickets(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicketForUser(user.id, id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    // senderRole comes from the authenticated user's actual role — agents
    // hitting this same route naturally get attributed correctly, no
    // separate agent-only message endpoint needed.
    return this.support.addMessage(id, user.id, user.role, dto.body, dto.attachmentUrls);
  }
}

@ApiTags('admin-support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AGENT_ROLES)
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private support: SupportService) {}

  @Get()
  queue(@Query('status') status?: TicketStatus) {
    return this.support.listQueue(status);
  }

  @Post(':id/assign')
  assign(@CurrentUser() agent: any, @Param('id') id: string) {
    return this.support.assign(id, agent.id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.support.close(id);
  }
}
