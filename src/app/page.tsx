'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WelcomeHero from '@/components/welcome/WelcomeHero';
import ChatInput from '@/components/input/ChatInput';
import { createNewSession, saveSession } from '@/lib/chat-storage';
import { createUserMessageFromComposer } from '@/lib/chat-message-utils';
import { ComposerSubmission } from '@/lib/chat-types';
import { setPendingChatMessage } from '@/lib/pending-chat';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '新会话创建失败，请稍后重试';
}

export default function HomePage() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [authed, setAuthed] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
    } else {
      setAuthed(true);
    }
  }, [router]);

  async function handleNewChat(payload: ComposerSubmission, model: string) {
    setErrorMessage(null);
    setIsStartingChat(true);
    const session = createNewSession();

    try {
      const message = await createUserMessageFromComposer(session.id, payload);
      saveSession(session, { sync: 'immediate' });
      setPendingChatMessage(session.id, { model, message });
      router.push(`/chat/${session.id}`);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setIsStartingChat(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {authed && (
        <>
          <WelcomeHero />
          <ChatInput
            onSubmit={handleNewChat}
            isLoading={isStartingChat}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage(null)}
          />
        </>
      )}
    </div>
  );
}
