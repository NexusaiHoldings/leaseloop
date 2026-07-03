'use client';

/**
 * /chat — TenantThread web chat widget.
 *
 * Interactive leasing assistant with:
 *  - Persistent session via server-side cookie (leadId)
 *  - Typing indicator while awaiting AI response
 *  - "Connect to human" escape hatch (Fair Housing human-access requirement)
 *  - Fair Housing equal opportunity notice in footer
 */

import { useState, useEffect, useRef, useTransition } from 'react';
import { initWebSession, sendWebMessage } from '@/lib/tenantthread/chat-agent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', alignItems: 'center' }}>
      <span style={{ fontStyle: 'italic', fontSize: '0.85em', color: '#888' }}>
        TenantThread is typing
      </span>
      <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '4px' }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#888',
              display: 'inline-block',
              animation: `bounce 1.2s infinite ${i * 0.2}s`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '10px',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? '#1a56db' : '#f3f4f6',
          color: isUser ? '#fff' : '#111',
          fontSize: '0.95em',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startTransition(async () => {
      try {
        const session = await initWebSession();
        setLeadId(session.leadId);
        setMessages(
          session.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        );
      } catch (err) {
        console.error('Chat init error:', err);
        setMessages([
          {
            id: 'err-init',
            role: 'assistant',
            content:
              "Hi! I'm your TenantThread leasing assistant. How can I help you find your next home?",
          },
        ]);
      } finally {
        setInitialized(true);
      }
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  function handleSend(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || isPending) return;

    setInput('');
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMessage]);

    startTransition(async () => {
      try {
        const result = await sendWebMessage(text);
        setLeadId(result.leadId);
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: result.response,
          },
        ]);
      } catch (err) {
        console.error('sendWebMessage error:', err);
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              "I'm having trouble responding right now. Please try again or click 'Connect to agent' below.",
          },
        ]);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleConnectHuman() {
    handleSend('HUMAN');
  }

  return (
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '0', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header / Brand */}
      <header
        style={{
          background: '#1a56db',
          color: '#fff',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#1a56db',
              fontSize: '1em',
            }}
          >
            TT
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1em' }}>TenantThread</div>
            <div style={{ fontSize: '0.75em', opacity: 0.85 }}>Leasing Assistant</div>
          </div>
        </div>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: '#4ade80',
            boxShadow: '0 0 6px #4ade80',
          }}
          title="Online"
        />
      </header>

      {/* Message thread */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!initialized && (
          <div style={{ textAlign: 'center', color: '#888', marginTop: '40px' }}>
            Loading…
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isPending && <TypingIndicator />}
      </div>

      {/* Connect to human — always visible per Fair Housing requirement */}
      <div
        style={{
          padding: '8px 20px 4px',
          borderTop: '1px solid #e5e7eb',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleConnectHuman}
          disabled={isPending}
          style={{
            width: '100%',
            padding: '8px 16px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            background: '#fff',
            color: '#374151',
            fontSize: '0.85em',
            cursor: isPending ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span>👤</span>
          <span>Connect to a human leasing agent</span>
        </button>
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '12px 20px 16px',
          background: '#fff',
          display: 'flex',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about availability, pricing, or scheduling a tour…"
          disabled={isPending || !initialized}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #d1d5db',
            borderRadius: '24px',
            fontSize: '0.95em',
            outline: 'none',
            background: isPending ? '#f9fafb' : '#fff',
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={isPending || !input.trim() || !initialized}
          style={{
            padding: '10px 20px',
            background: '#1a56db',
            color: '#fff',
            border: 'none',
            borderRadius: '24px',
            fontWeight: 600,
            fontSize: '0.95em',
            cursor: isPending || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isPending || !input.trim() ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>

      {/* Fair Housing footer */}
      <div
        style={{
          padding: '8px 20px',
          background: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          fontSize: '0.7em',
          color: '#9ca3af',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        Equal opportunity housing. We do not discriminate on the basis of race, color, religion,
        sex, national origin, familial status, or disability — Fair Housing Act (42 U.S.C. § 3604).
      </div>
    </main>
  );
}
