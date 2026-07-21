export type PublicUser = {
  id: number;
  displayName: string | null;
  username: string | null;
};

export type Conversation = {
  id: number;
  peer: PublicUser;
  lastText: string | null;
  lastMessageAt: number | null;
  createdAt: number;
};

export type ChatMessage = {
  id: number;
  senderId: number;
  text: string;
  createdAt: number;
  isRead: boolean;
};
