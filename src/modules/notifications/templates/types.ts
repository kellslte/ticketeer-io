export interface BaseTemplateData {
  appUrl?: string;
  year?: number;
}

export interface VerifyEmailTemplateData extends BaseTemplateData {
  name: string;
  verifyUrl: string;
  expiresInHours?: number;
}

export interface TicketAssignedTemplateData extends BaseTemplateData {
  assigneeName: string;
  ticketId: string;
  ticketTitle: string;
  ticketDescription?: string;
  ticketStatus: string;
  ticketUrl: string;
  assignedAt?: string;
}

export interface TicketStatusChangedTemplateData extends BaseTemplateData {
  requesterName: string;
  ticketId: string;
  ticketTitle: string;
  fromStatus: string;
  toStatus: string;
  ticketUrl: string;
  updatedAt?: string;
}

export type EmailTemplateMap = {
  'verify-email': VerifyEmailTemplateData;
  'ticket-assigned': TicketAssignedTemplateData;
  'ticket-status-changed': TicketStatusChangedTemplateData;
};

export type EmailTemplateName = keyof EmailTemplateMap;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

