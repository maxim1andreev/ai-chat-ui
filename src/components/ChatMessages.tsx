import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Card, Flex, Space, Spin, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { RefObject, UIEvent } from 'react';
import type { ChatMessage } from '../types/chat';

const { Text } = Typography;

interface ChatMessagesProps {
  messages: ChatMessage[];
  isSending: boolean;
  isAwaitingFirstChunk: boolean;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  messagesRef: RefObject<HTMLDivElement>;
}

export function ChatMessages({
  messages,
  isSending,
  isAwaitingFirstChunk,
  onScroll,
  messagesRef,
}: ChatMessagesProps) {
  return (
    <div
      className="chat-messages"
      aria-live="polite"
      ref={messagesRef}
      onScroll={onScroll}
    >
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <Flex key={message.id} justify={isUser ? 'end' : 'start'}>
            <Card className={`bubble bubble-${message.role}`} size="small">
              <Space align="start">
                <Avatar
                  icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                  className="bubble-avatar"
                />
                <div>
                  <Text strong>{isUser ? 'Вы' : 'AI'}</Text>
                  <div className="bubble-text markdown-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </Space>
            </Card>
          </Flex>
        );
      })}
      {isSending && isAwaitingFirstChunk && (
        <Flex justify="start">
          <Card className="bubble bubble-assistant" size="small">
            <Space>
              <Spin size="small" />
              <Text>AI печатает...</Text>
            </Space>
          </Card>
        </Flex>
      )}
    </div>
  );
}
