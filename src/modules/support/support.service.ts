import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketStatus, UserRole } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createTicket(userId: string, subject: string, body: string) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject,
        messages: { create: { senderId: userId, senderRole: UserRole.USER, body } },
      },
      include: { messages: true },
    });

    // No SUPPORT-role users to notify individually yet at MVP scale — the
    // admin queue (GET /admin/support/tickets) is the source of truth.
    // If/when agent assignment exists, notify the assignee instead.
    return ticket;
  }

  async listOwnTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getTicketForUser(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException();
    return ticket;
  }

  /** Called by both the USER route and the SUPPORT-agent route — role passed in from the controller. */
  async addMessage(
    ticketId: string,
    senderId: string,
    senderRole: UserRole,
    body: string,
    attachmentUrls: string[] = [],
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (senderRole === UserRole.USER && ticket.userId !== senderId) {
      throw new ForbiddenException();
    }

    const message = await this.prisma.supportMessage.create({
      data: { ticketId, senderId, senderRole, body, attachmentUrls },
    });

    // Move OPEN -> IN_PROGRESS the first time an agent replies.
    if (senderRole !== UserRole.USER && ticket.status === TicketStatus.OPEN) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    // Notify the other party.
    if (senderRole === UserRole.USER) {
      // Agent-side notification deferred until assignment/agent-user model exists.
    } else {
      await this.notifications.create(
        ticket.userId,
        'support',
        `New reply on "${ticket.subject}"`,
        body.slice(0, 140),
      );
    }

    return message;
  }

  // ---- Admin/agent side ----

  async listQueue(status?: TicketStatus) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async assign(ticketId: string, agentId: string) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedTo: agentId },
    });
  }

  async close(ticketId: string) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.CLOSED },
    });
    await this.notifications.create(
      ticket.userId,
      'support',
      `Ticket "${ticket.subject}" closed`,
      'Your support ticket has been marked as resolved and closed.',
    );
    return ticket;
  }
}
