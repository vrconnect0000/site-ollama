
export type Role = 'user' | 'model';

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  image?: string;
  isStreaming?: boolean;
  user_name?: string;
  user_avatar?: string;
  session_id?: string;
}

export interface ChatSession {
  id: string;
  name: string;
  avatar: string;
  lastMessage?: string;
  personality: string;
  messages: Message[];
}

export interface UserProfile {
  name: string;
  avatar: string;
}
