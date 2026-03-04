import { MessageOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';
import type { ChatState } from '../types/chat';

const { Text } = Typography;

interface ChatSidebarProps {
  chats: ChatState[];
  activeChatId: string | null;
  isCreatingChat: boolean;
  isVoiceBusy: boolean;
  getChatPreview: (chat: ChatState) => string;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
}

export function ChatSidebar({
  chats,
  activeChatId,
  isCreatingChat,
  isVoiceBusy,
  getChatPreview,
  onCreateChat,
  onSelectChat,
}: ChatSidebarProps) {
  return (
    <aside className="chat-sidebar">
      <Button
        type="primary"
        icon={<PlusOutlined />}
        block
        onClick={onCreateChat}
        loading={isCreatingChat}
        disabled={isVoiceBusy}
      >
        Новый чат
      </Button>

      <div className="chat-list">
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <Space align="start" size={8}>
              <MessageOutlined />
              <div className="chat-list-text">
                <Text strong ellipsis>
                  {chat.title}
                </Text>
                <Text ellipsis>{getChatPreview(chat)}</Text>
              </div>
            </Space>
          </button>
        ))}
      </div>
    </aside>
  );
}
